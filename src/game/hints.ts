import { isPlaceStep, type Step } from '../core/deduce.ts';
import { clueName, describeStep } from '../core/explain.ts';
import { bit, type Puzzle } from '../core/puzzle.ts';

export interface Hint {
  lines: string[];
  clue: number;
  cell: number;
}

/** Did this earlier step narrow down where `clue` can go? */
function affects(p: Puzzle, step: Step, clue: number): boolean {
  switch (step.technique) {
    case 'lineFull':
    case 'lineNeeds':
      return step.eliminated.some((e) => e.clue === clue);
    case 'hypothesis':
      return step.clue === clue;
    default:
      return step.clue !== clue && (p.candidates[clue] & bit(step.cell)) !== 0;
  }
}

/**
 * Follows the logical solve path and explains the first placement the player hasn't made yet,
 * together with the last couple of deductions that led to it.
 */
export function nextHint(p: Puzzle, steps: Step[], placement: number[]): Hint | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!isPlaceStep(step) || placement[step.clue] === step.cell) continue;

    const context = steps
      .slice(0, i)
      .filter((st) => affects(p, st, step.clue))
      .slice(-2)
      .map((st) => describeStep(p, st));
    const lines = [...context, describeStep(p, step)];

    const occupant = placement.indexOf(step.cell);
    if (occupant >= 0) lines.push(`${clueName(p, occupant)} está ocupando esse quadro agora.`);
    return { lines, clue: step.clue, cell: step.cell };
  }
  return null;
}
