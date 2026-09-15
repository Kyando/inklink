/**
 * Human-style deduction engine. Solves a puzzle step by step using named techniques,
 * which gives us a difficulty rating and explainable hints.
 */
import { bit, cellsOf, popcount, type Puzzle } from './puzzle.ts';

export type Technique = 'single' | 'lineFull' | 'hiddenSingle' | 'lineNeeds' | 'hypothesis' | 'guess';

export const TECHNIQUE_LEVEL: Record<Technique, number> = {
  single: 1,
  lineFull: 1,
  hiddenSingle: 2,
  lineNeeds: 2,
  hypothesis: 3,
  guess: 4,
};

export const LEVEL_LABEL = ['', 'Fácil', 'Médio', 'Difícil', 'Diabólico'] as const;

export interface Elimination {
  clue: number;
  cell: number;
}

export type Contradiction =
  | { type: 'noCell'; clue: number }
  | { type: 'lineOver'; line: number }
  | { type: 'lineShort'; line: number };

export type Step =
  /** The clue has a single candidate left. */
  | { technique: 'single'; clue: number; cell: number }
  /** A cell must be filled and only one clue fits it. `line` is null on full boards. */
  | { technique: 'hiddenSingle'; clue: number; cell: number; line: number | null }
  /** A line already has all its clues. */
  | { technique: 'lineFull'; line: number; eliminated: Elimination[] }
  /** A line needs N more clues and exactly N clues can still go there. */
  | { technique: 'lineNeeds'; line: number; clues: number[]; eliminated: Elimination[] }
  /** Assuming clue→cell leads (via basic steps) to a contradiction. */
  | { technique: 'hypothesis'; clue: number; cell: number; contradiction: Contradiction; chain: Step[] }
  /** No logical step found; fall back to the known solution. */
  | { technique: 'guess'; clue: number; cell: number };

export type PlaceStep = Extract<Step, { technique: 'single' | 'hiddenSingle' | 'guess' }>;

export const isPlaceStep = (step: Step): step is PlaceStep =>
  step.technique === 'single' || step.technique === 'hiddenSingle' || step.technique === 'guess';

export interface DState {
  /** Remaining candidates per clue (a single bit once placed). */
  cand: number[];
  /** Cell per clue, -1 when not placed. */
  placed: number[];
  taken: number;
}

export function initialState(p: Puzzle): DState {
  return { cand: [...p.candidates], placed: new Array<number>(p.nClues).fill(-1), taken: 0 };
}

const cloneState = (s: DState): DState => ({ cand: [...s.cand], placed: [...s.placed], taken: s.taken });

function place(s: DState, clue: number, cell: number): void {
  const b = bit(cell);
  s.placed[clue] = cell;
  s.cand[clue] = b;
  s.taken |= b;
  for (let other = 0; other < s.cand.length; other++) {
    if (other !== clue && s.placed[other] < 0) s.cand[other] &= ~b;
  }
}

export function applyStep(s: DState, step: Step): void {
  switch (step.technique) {
    case 'single':
    case 'hiddenSingle':
    case 'guess':
      place(s, step.clue, step.cell);
      break;
    case 'lineFull':
    case 'lineNeeds':
      for (const e of step.eliminated) s.cand[e.clue] &= ~bit(e.cell);
      break;
    case 'hypothesis':
      s.cand[step.clue] &= ~bit(step.cell);
      break;
  }
}

interface LineInfo {
  mask: number;
  /** Clues still missing; negative when over the count. */
  need: number;
  /** Free cells of the line some unplaced clue can still take. */
  open: number;
  /** Unplaced clues that can still go in the line. */
  clues: number[];
}

function lineInfo(p: Puzzle, s: DState, l: number): LineInfo {
  const line = p.lines[l];
  let placedIn = 0;
  let reach = 0;
  const clues: number[] = [];
  for (let clue = 0; clue < p.nClues; clue++) {
    if (s.placed[clue] >= 0) {
      if (line.mask & bit(s.placed[clue])) placedIn++;
    } else if (s.cand[clue] & line.mask) {
      clues.push(clue);
      reach |= s.cand[clue];
    }
  }
  return { mask: line.mask, need: (line.count ?? 0) - placedIn, open: reach & line.mask & ~s.taken, clues };
}

const countedLines = (p: Puzzle): number[] =>
  p.lines.flatMap((line, l) => (line.count === null ? [] : [l]));

export function findContradiction(p: Puzzle, s: DState): Contradiction | null {
  for (let clue = 0; clue < p.nClues; clue++) {
    if (s.placed[clue] < 0 && !s.cand[clue]) return { type: 'noCell', clue };
  }
  for (const l of countedLines(p)) {
    const info = lineInfo(p, s, l);
    if (info.need < 0) return { type: 'lineOver', line: l };
    if (info.need > popcount(info.open) || info.need > info.clues.length) return { type: 'lineShort', line: l };
  }
  return null;
}

function findBasicStep(p: Puzzle, s: DState): Step | null {
  for (let clue = 0; clue < p.nClues; clue++) {
    if (s.placed[clue] < 0 && popcount(s.cand[clue]) === 1) {
      return { technique: 'single', clue, cell: cellsOf(s.cand[clue])[0] };
    }
  }

  const lines = countedLines(p).map((l) => ({ l, info: lineInfo(p, s, l) }));

  for (const { l, info } of lines) {
    if (info.need !== 0 || !info.clues.length) continue;
    const eliminated = info.clues.flatMap((clue) =>
      cellsOf(s.cand[clue] & info.mask).map((cell) => ({ clue, cell })),
    );
    return { technique: 'lineFull', line: l, eliminated };
  }

  const holdersOf = (cell: number, clues: number[]) => clues.filter((clue) => s.cand[clue] & bit(cell));
  if (p.fullFill) {
    const unplaced = s.placed.flatMap((cell, clue) => (cell < 0 ? [clue] : []));
    for (let cell = 0; cell < p.nCells; cell++) {
      if (s.taken & bit(cell)) continue;
      const holders = holdersOf(cell, unplaced);
      if (holders.length === 1) return { technique: 'hiddenSingle', clue: holders[0], cell, line: null };
    }
  }
  for (const { l, info } of lines) {
    if (info.need <= 0 || info.need !== popcount(info.open)) continue;
    for (const cell of cellsOf(info.open)) {
      const holders = holdersOf(cell, info.clues);
      if (holders.length === 1) return { technique: 'hiddenSingle', clue: holders[0], cell, line: l };
    }
  }

  for (const { l, info } of lines) {
    if (info.need <= 0 || info.need !== info.clues.length) continue;
    const eliminated = info.clues.flatMap((clue) =>
      cellsOf(s.cand[clue] & ~info.mask).map((cell) => ({ clue, cell })),
    );
    if (eliminated.length) return { technique: 'lineNeeds', line: l, clues: info.clues, eliminated };
  }

  return null;
}

type Outcome =
  | { kind: 'solved' | 'stuck'; chain: Step[] }
  | { kind: 'contradiction'; contradiction: Contradiction; chain: Step[] };

/** Applies basic steps until solved, stuck or contradicted. Mutates `s`. */
function propagate(p: Puzzle, s: DState): Outcome {
  const chain: Step[] = [];
  for (;;) {
    const contradiction = findContradiction(p, s);
    if (contradiction) return { kind: 'contradiction', contradiction, chain };
    if (s.placed.every((cell) => cell >= 0)) return { kind: 'solved', chain };
    const step = findBasicStep(p, s);
    if (!step) return { kind: 'stuck', chain };
    applyStep(s, step);
    chain.push(step);
  }
}

/** Tries every open placement; returns the one refuted by the shortest chain. */
function findHypothesis(p: Puzzle, s: DState): Step | null {
  let best: Extract<Step, { technique: 'hypothesis' }> | null = null;
  for (let clue = 0; clue < p.nClues; clue++) {
    if (s.placed[clue] >= 0) continue;
    for (const cell of cellsOf(s.cand[clue])) {
      const trial = cloneState(s);
      place(trial, clue, cell);
      const out = propagate(p, trial);
      if (out.kind === 'contradiction' && (!best || out.chain.length < best.chain.length)) {
        best = { technique: 'hypothesis', clue, cell, contradiction: out.contradiction, chain: out.chain };
      }
    }
  }
  return best;
}

export interface Rating {
  /** 1 Fácil · 2 Médio · 3 Difícil · 4 Diabólico (needs guessing). */
  level: number;
  label: string;
  steps: Step[];
  hypotheses: number;
  guesses: number;
}

export function solveLogically(p: Puzzle): Rating {
  const s = initialState(p);
  const steps: Step[] = [];
  let level = 1;

  while (s.placed.some((cell) => cell < 0)) {
    let step = findBasicStep(p, s) ?? findHypothesis(p, s);
    if (!step) {
      const open = s.placed.flatMap((cell, clue) => (cell < 0 ? [clue] : []));
      const clue = open.reduce((a, b) => (popcount(s.cand[b]) < popcount(s.cand[a]) ? b : a));
      step = { technique: 'guess', clue, cell: p.solution[clue] };
    }
    applyStep(s, step);
    steps.push(step);
    level = Math.max(level, TECHNIQUE_LEVEL[step.technique]);
  }

  return {
    level,
    label: LEVEL_LABEL[level],
    steps,
    hypotheses: steps.filter((st) => st.technique === 'hypothesis').length,
    guesses: steps.filter((st) => st.technique === 'guess').length,
  };
}
