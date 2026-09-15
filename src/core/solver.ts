import { bit, cellsOf, linesOfCell, type Puzzle } from './puzzle.ts';

export interface SolveResult {
  count: number;
  /** Each solution is a cell per clue. */
  solutions: number[][];
}

/** Exhaustive backtracking search. Stops after `limit` solutions (2 is enough to test uniqueness). */
export function findSolutions(p: Puzzle, limit = 2): SolveResult {
  const assign = new Array<number>(p.nClues).fill(-1);
  const used = new Array<number>(p.lines.length).fill(0);
  const solutions: number[][] = [];
  let taken = 0;

  const isFree = (cell: number): boolean => {
    if (taken & bit(cell)) return false;
    for (const l of linesOfCell(p, cell)) {
      const n = p.lines[l].count;
      if (n !== null && used[l] >= n) return false;
    }
    return true;
  };

  /** Every counted line can still reach its count with the clues left. */
  const reachable = (): boolean => {
    let open = 0;
    for (let clue = 0; clue < p.nClues; clue++) if (assign[clue] < 0) open |= p.candidates[clue];
    open &= ~taken;
    return p.lines.every((line, l) => {
      if (line.count === null) return true;
      let possible = 0;
      for (const cell of cellsOf(open & line.mask)) if (isFree(cell)) possible++;
      return used[l] + possible >= line.count;
    });
  };

  const search = (placed: number): void => {
    if (placed === p.nClues) {
      if (p.lines.every((line, l) => line.count === null || used[l] === line.count)) {
        solutions.push([...assign]);
      }
      return;
    }
    if (!reachable()) return;

    let best = -1;
    let bestOptions: number[] = [];
    for (let clue = 0; clue < p.nClues; clue++) {
      if (assign[clue] >= 0) continue;
      const options = cellsOf(p.candidates[clue]).filter(isFree);
      if (!options.length) return;
      if (best < 0 || options.length < bestOptions.length) {
        best = clue;
        bestOptions = options;
      }
    }

    for (const cell of bestOptions) {
      const [rl, cl] = linesOfCell(p, cell);
      assign[best] = cell;
      taken |= bit(cell);
      used[rl]++;
      used[cl]++;
      search(placed + 1);
      used[rl]--;
      used[cl]--;
      taken &= ~bit(cell);
      assign[best] = -1;
      if (solutions.length >= limit) return;
    }
  };

  search(0);
  return { count: solutions.length, solutions };
}
