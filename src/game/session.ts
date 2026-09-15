import type { Rating } from '../core/deduce.ts';
import { bit, cellKey, cellsOf, type Puzzle } from '../core/puzzle.ts';
import { nextHint, type Hint } from './hints.ts';
import type { LevelProgress } from './save.ts';

interface Snapshot {
  placement: number[];
  notes: number[];
}

export interface CheckResult {
  correct: number;
  total: number;
  solved: boolean;
}

const HISTORY_LIMIT = 200;

/** The state of one level being played. Indices internally, ids in the saved progress. */
export class Session {
  readonly puzzle: Puzzle;
  readonly rating: Rating;
  readonly progress: LevelProgress;
  /** Cell per clue, -1 when in the tray. */
  placement: number[];
  /** Bitmask of noted clues per cell. */
  notes: number[];
  private history: Snapshot[] = [];
  private readonly onSave: () => void;

  constructor(puzzle: Puzzle, rating: Rating, progress: LevelProgress, onSave: () => void) {
    this.puzzle = puzzle;
    this.rating = rating;
    this.progress = progress;
    this.onSave = onSave;

    const cellByKey = new Map(Array.from({ length: puzzle.nCells }, (_, c) => [cellKey(puzzle, c), c]));
    const clueById = new Map(puzzle.def.clues.map((c, i) => [c.id, i]));

    this.placement = new Array<number>(puzzle.nClues).fill(-1);
    puzzle.def.clues.forEach((clue, i) => {
      const cell = cellByKey.get(progress.placements[clue.id]);
      if (cell !== undefined && !this.placement.includes(cell)) this.placement[i] = cell;
    });

    this.notes = new Array<number>(puzzle.nCells).fill(0);
    for (const [key, ids] of Object.entries(progress.notes)) {
      const cell = cellByKey.get(key);
      if (cell === undefined) continue;
      for (const id of ids) {
        const clue = clueById.get(id);
        if (clue !== undefined) this.notes[cell] |= bit(clue);
      }
    }
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get placedCount(): number {
    return this.placement.filter((c) => c >= 0).length;
  }

  get allPlaced(): boolean {
    return this.placedCount === this.puzzle.nClues;
  }

  clueAt(cell: number): number {
    return this.placement.indexOf(cell);
  }

  /** Clues currently placed in a line. */
  lineUsage(line: number): number {
    const mask = this.puzzle.lines[line].mask;
    return this.placement.filter((c) => c >= 0 && mask & bit(c)).length;
  }

  /** Moves a clue to a cell (swapping with its occupant) or back to the tray (`null`). */
  move(clue: number, cell: number | null): boolean {
    const from = this.placement[clue];
    const to = cell ?? -1;
    if (from === to) return false;
    this.snapshot();
    if (to >= 0) {
      const occupant = this.clueAt(to);
      if (occupant >= 0) this.placement[occupant] = from;
    }
    this.placement[clue] = to;
    this.progress.moves++;
    this.commit();
    return true;
  }

  toggleNote(clue: number, cell: number): void {
    this.snapshot();
    this.notes[cell] ^= bit(clue);
    this.commit();
  }

  undo(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.placement = last.placement;
    this.notes = last.notes;
    this.commit();
    return true;
  }

  reset(): void {
    this.snapshot();
    this.placement.fill(-1);
    this.notes.fill(0);
    this.commit();
  }

  check(): CheckResult {
    const correct = this.placement.filter((cell, clue) => cell === this.puzzle.solution[clue]).length;
    const solved = correct === this.puzzle.nClues;
    this.progress.checks++;
    if (solved) this.progress.done = true;
    this.commit();
    return { correct, total: this.puzzle.nClues, solved };
  }

  hint(): Hint | null {
    const hint = nextHint(this.puzzle, this.rating.steps, this.placement);
    if (hint) {
      this.progress.hints++;
      this.commit();
    }
    return hint;
  }

  private snapshot(): void {
    this.history.push({ placement: [...this.placement], notes: [...this.notes] });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private commit(): void {
    const p = this.puzzle;
    this.progress.placements = Object.fromEntries(
      this.placement.flatMap((cell, clue) => (cell >= 0 ? [[p.def.clues[clue].id, cellKey(p, cell)]] : [])),
    );
    this.progress.notes = Object.fromEntries(
      this.notes.flatMap((mask, cell) =>
        mask ? [[cellKey(p, cell), cellsOf(mask).map((clue) => p.def.clues[clue].id)]] : [],
      ),
    );
    this.onSave();
  }
}
