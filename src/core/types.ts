/**
 * Level data format (the JSON files in src/levels).
 * This is the single source of truth shared by the web game and future exporters (PDF, Godot...).
 */

export interface WordDef {
  id: string;
  label: string;
  /** An emoji, or a path to an image asset (.svg/.png/.webp) under public/. */
  icon: string;
}

export interface ClueDef extends WordDef {
  /** Cells where this clue plausibly fits, as "rowId+colId". */
  candidates: string[];
}

/** Which line counts are printed on the board. */
export type CountsMode = 'none' | 'rows' | 'cols' | 'both';

export interface LevelDef {
  id: string;
  title: string;
  subtitle?: string;
  rows: WordDef[];
  cols: WordDef[];
  clues: ClueDef[];
  /** clueId -> "rowId+colId" */
  solution: Record<string, string>;
  counts?: CountsMode;
}
