import { buildPuzzle, type Puzzle } from './puzzle.ts';
import { solveLogically, type Rating } from './deduce.ts';
import { findSolutions } from './solver.ts';
import type { CountsMode, LevelDef } from './types.ts';

export interface Analysis {
  puzzle: Puzzle;
  unique: boolean;
  /** A second solution when the level is ambiguous (cell per clue). */
  alternative: number[] | null;
  rating: Rating;
}

export function analyzeLevel(def: LevelDef): Analysis {
  const puzzle = buildPuzzle(def);
  const { solutions } = findSolutions(puzzle, 2);
  const alternative = solutions.find((sol) => sol.some((cell, clue) => cell !== puzzle.solution[clue])) ?? null;
  return { puzzle, unique: solutions.length === 1 && !alternative, alternative, rating: solveLogically(puzzle) };
}

export interface SolutionOption {
  solution: Record<string, string>;
  counts: CountsMode;
  rating: Rating;
}

/**
 * Authoring helper: given a level's words and clue candidates, enumerates every way of
 * placing the clues and keeps the ones that have a unique solution for some counts mode.
 * The declared solution in `def` is ignored.
 */
export function exploreSolutions(
  def: LevelDef,
  { modes = ['none', 'rows', 'cols', 'both'] as CountsMode[], maxAssignments = 200_000 } = {},
): { options: SolutionOption[]; assignments: number; truncated: boolean } {
  const cellKeys = def.rows.flatMap((r) => def.cols.map((c) => `${r.id}+${c.id}`));
  const candidates = def.clues.map((clue) =>
    clue.candidates.reduce((mask, key) => {
      const cell = cellKeys.indexOf(key);
      if (cell < 0) throw new Error(`Nível "${def.id}": dica "${clue.id}" tem quadro inválido "${key}"`);
      return mask | (1 << cell);
    }, 0),
  );

  const options: SolutionOption[] = [];
  const assign: number[] = new Array<number>(def.clues.length).fill(-1);
  let assignments = 0;
  let taken = 0;

  const visit = (clue: number): void => {
    if (assignments >= maxAssignments) return;
    if (clue === def.clues.length) {
      assignments++;
      const solution = Object.fromEntries(def.clues.map((c, i) => [c.id, cellKeys[assign[i]]]));
      for (const counts of modes) {
        const candidate = { ...def, solution, counts };
        const puzzle = buildPuzzle(candidate);
        if (findSolutions(puzzle, 2).count === 1) {
          options.push({ solution, counts, rating: solveLogically(puzzle) });
        }
      }
      return;
    }
    for (let m = candidates[clue], cell = 0; m; m >>>= 1, cell++) {
      if (!(m & 1) || taken & (1 << cell)) continue;
      assign[clue] = cell;
      taken |= 1 << cell;
      visit(clue + 1);
      taken &= ~(1 << cell);
    }
  };
  visit(0);

  options.sort((a, b) => b.rating.level - a.rating.level || b.rating.hypotheses - a.rating.hypotheses);
  return { options, assignments, truncated: assignments >= maxAssignments };
}
