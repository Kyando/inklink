import { solveLogically, type Rating } from '../core/deduce.ts';
import { buildPuzzle, type Puzzle } from '../core/puzzle.ts';
import type { LevelDef } from '../core/types.ts';

export interface CatalogEntry {
  def: LevelDef;
  puzzle: Puzzle;
  rating: Rating;
}

// Levels are ordered by file name (01-..., 02-...).
const modules = import.meta.glob<LevelDef>('./*.json', { eager: true, import: 'default' });

export const CATALOG: CatalogEntry[] = Object.keys(modules)
  .sort()
  .flatMap((path) => {
    try {
      const def = modules[path];
      const puzzle = buildPuzzle(def);
      return [{ def, puzzle, rating: solveLogically(puzzle) }];
    } catch (err) {
      console.error(`Nível ignorado (${path}):`, err);
      return [];
    }
  });
