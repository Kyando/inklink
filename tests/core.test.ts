import { describe, expect, it } from 'vitest';
import { analyzeLevel } from '../src/core/analyze.ts';
import { applyStep, initialState, solveLogically } from '../src/core/deduce.ts';
import { buildPuzzle, LevelError } from '../src/core/puzzle.ts';
import { findSolutions } from '../src/core/solver.ts';
import type { LevelDef } from '../src/core/types.ts';
import { nextHint } from '../src/game/hints.ts';

const levels = import.meta.glob<LevelDef>('../src/levels/*.json', { eager: true, import: 'default' });

const word = (id: string) => ({ id, label: id, icon: '•' });

/** 1×3 board, two clues, no counts: A fits a or b, B fits b or c. */
const openBoard: LevelDef = {
  id: 'open',
  title: 'open',
  rows: [word('r')],
  cols: [word('a'), word('b'), word('c')],
  clues: [
    { ...word('A'), candidates: ['r+a', 'r+b'] },
    { ...word('B'), candidates: ['r+b', 'r+c'] },
  ],
  solution: { A: 'r+a', B: 'r+b' },
};

describe('níveis publicados', () => {
  for (const [path, def] of Object.entries(levels)) {
    it(`${path} tem solução única e dedutível`, () => {
      const { puzzle, unique, rating } = analyzeLevel(def);
      expect(unique).toBe(true);
      expect(rating.guesses).toBe(0);

      const state = initialState(puzzle);
      rating.steps.forEach((step) => applyStep(state, step));
      expect(state.placed).toEqual(puzzle.solution);
    });
  }
});

describe('solver', () => {
  it('encontra ambiguidade quando quadros vazios não têm contagem', () => {
    expect(findSolutions(buildPuzzle(openBoard), 5).count).toBe(3);
  });

  it('contagens de coluna tornam a solução única', () => {
    expect(findSolutions(buildPuzzle({ ...openBoard, counts: 'cols' })).count).toBe(1);
  });

  it('rejeita soluções fora dos candidatos', () => {
    expect(() => buildPuzzle({ ...openBoard, solution: { A: 'r+c', B: 'r+b' } })).toThrow(LevelError);
  });
});

describe('dedução', () => {
  it('só elimina opções que não fazem parte da solução', () => {
    for (const def of Object.values(levels)) {
      const puzzle = buildPuzzle(def);
      const state = initialState(puzzle);
      for (const step of solveLogically(puzzle).steps) {
        applyStep(state, step);
        puzzle.solution.forEach((cell, clue) => expect(state.cand[clue] & (1 << cell)).not.toBe(0));
      }
    }
  });

  it('dicas apontam para a próxima peça fora do lugar', () => {
    const puzzle = buildPuzzle({ ...openBoard, counts: 'cols' });
    const { steps } = solveLogically(puzzle);
    const hint = nextHint(puzzle, steps, [-1, -1]);
    expect(hint).not.toBeNull();
    expect(nextHint(puzzle, steps, puzzle.solution)).toBeNull();
  });
});
