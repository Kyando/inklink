/** Local persistence (per browser). Everything is keyed by ids so level edits don't corrupt saves. */

export interface LevelProgress {
  /** clueId -> "rowId+colId" */
  placements: Record<string, string>;
  /** "rowId+colId" -> clueIds noted in that cell */
  notes: Record<string, string[]>;
  done: boolean;
  checks: number;
  hints: number;
  moves: number;
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface SaveData {
  version: 1;
  levels: Record<string, LevelProgress>;
  settings: { theme: ThemeChoice; sound: boolean; seenHelp: boolean; lastLevel: string | null };
}

const KEY = 'inklink:v1';

const defaults = (): SaveData => ({
  version: 1,
  levels: {},
  settings: { theme: 'system', sound: true, seenHelp: false, lastLevel: null },
});

export const emptyProgress = (): LevelProgress => ({
  placements: {},
  notes: {},
  done: false,
  checks: 0,
  hints: 0,
  moves: 0,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return defaults();
    return { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
  } catch {
    return defaults();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode, quota): the game still works for this session.
  }
}
