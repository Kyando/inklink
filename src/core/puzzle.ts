import type { LevelDef } from './types.ts';

/** Cells are stored as bits of a 32-bit integer. */
export const MAX_CELLS = 30;

export type LineKind = 'row' | 'col';

export interface Line {
  kind: LineKind;
  /** Row or column index. */
  index: number;
  /** Bitmask of the cells in this line. */
  mask: number;
  /** How many clues the solution puts in this line; null when the player can't know it. */
  count: number | null;
  /** Whether the count is printed on the board (full boards have implicit, hidden counts). */
  shown: boolean;
}

/** A validated level, indexed for fast solving. */
export interface Puzzle {
  def: LevelDef;
  nRows: number;
  nCols: number;
  nCells: number;
  nClues: number;
  /** Candidate cells per clue, as bitmasks. */
  candidates: number[];
  /** Solution cell per clue. */
  solution: number[];
  /** Rows first (line index = row), then columns (line index = nRows + col). */
  lines: Line[];
  /** Every cell receives a clue. */
  fullFill: boolean;
}

export class LevelError extends Error {}

export const bit = (cell: number): number => 1 << cell;

export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

export function cellsOf(mask: number): number[] {
  const out: number[] = [];
  for (let m = mask, c = 0; m; m >>>= 1, c++) if (m & 1) out.push(c);
  return out;
}

export const rowOf = (p: Puzzle, cell: number): number => Math.floor(cell / p.nCols);
export const colOf = (p: Puzzle, cell: number): number => cell % p.nCols;

/** Line indices [row line, column line] containing a cell. */
export const linesOfCell = (p: Puzzle, cell: number): [number, number] => [
  rowOf(p, cell),
  p.nRows + colOf(p, cell),
];

export const cellKey = (p: Puzzle, cell: number): string =>
  `${p.def.rows[rowOf(p, cell)].id}+${p.def.cols[colOf(p, cell)].id}`;

export function buildPuzzle(def: LevelDef): Puzzle {
  const errors: string[] = [];
  const nRows = def.rows.length;
  const nCols = def.cols.length;
  const nCells = nRows * nCols;
  const nClues = def.clues.length;

  if (!nRows || !nCols) errors.push('o nível precisa de ao menos 1 linha e 1 coluna');
  if (nCells > MAX_CELLS) errors.push(`máximo de ${MAX_CELLS} quadros (tem ${nCells})`);
  if (nClues > nCells) errors.push(`há mais dicas (${nClues}) que quadros (${nCells})`);

  const ids = new Set<string>();
  for (const w of [...def.rows, ...def.cols, ...def.clues]) {
    if (ids.has(w.id)) errors.push(`id repetido: "${w.id}"`);
    ids.add(w.id);
  }

  const rowIdx = new Map(def.rows.map((w, i) => [w.id, i]));
  const colIdx = new Map(def.cols.map((w, i) => [w.id, i]));
  const parseCell = (key: string, where: string): number => {
    const [r, c] = key.split('+');
    const ri = rowIdx.get(r);
    const ci = colIdx.get(c);
    if (ri === undefined || ci === undefined) {
      errors.push(`${where}: quadro inválido "${key}" (use "linha+coluna")`);
      return -1;
    }
    return ri * nCols + ci;
  };

  const candidates = def.clues.map((clue) => {
    let mask = 0;
    for (const key of clue.candidates) {
      const cell = parseCell(key, `dica "${clue.id}"`);
      if (cell >= 0) mask |= bit(cell);
    }
    if (!mask) errors.push(`dica "${clue.id}" não tem candidatos`);
    return mask;
  });

  const used = new Map<number, string>();
  const solution = def.clues.map((clue, i) => {
    const key = def.solution[clue.id];
    if (!key) {
      errors.push(`a solução não posiciona a dica "${clue.id}"`);
      return -1;
    }
    const cell = parseCell(key, `solução de "${clue.id}"`);
    if (cell < 0) return -1;
    if (!(candidates[i] & bit(cell))) {
      errors.push(`solução de "${clue.id}" (${key}) não está entre os candidatos`);
    }
    const other = used.get(cell);
    if (other) errors.push(`"${clue.id}" e "${other}" ocupam o mesmo quadro na solução`);
    used.set(cell, clue.id);
    return cell;
  });

  if (errors.length) {
    throw new LevelError(`Nível "${def.id}":\n  - ${errors.join('\n  - ')}`);
  }

  const fullFill = nClues === nCells;
  const mode = def.counts ?? 'none';
  const lines: Line[] = [];
  const addLine = (kind: LineKind, index: number, cells: number[], shown: boolean) => {
    const mask = cells.reduce((m, c) => m | bit(c), 0);
    const actual = solution.filter((c) => mask & bit(c)).length;
    lines.push({ kind, index, mask, shown, count: shown || fullFill ? actual : null });
  };
  for (let r = 0; r < nRows; r++) {
    const cells = Array.from({ length: nCols }, (_, c) => r * nCols + c);
    addLine('row', r, cells, !fullFill && (mode === 'rows' || mode === 'both'));
  }
  for (let c = 0; c < nCols; c++) {
    const cells = Array.from({ length: nRows }, (_, r) => r * nCols + c);
    addLine('col', c, cells, !fullFill && (mode === 'cols' || mode === 'both'));
  }

  return { def, nRows, nCols, nCells, nClues, candidates, solution, lines, fullFill };
}
