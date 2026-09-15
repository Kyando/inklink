/**
 * Validates every level and prints its difficulty.
 *   npm run levels            summary
 *   npm run levels -- --steps also prints the deduction walkthrough
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeLevel } from '../src/core/analyze.ts';
import { describeStep } from '../src/core/explain.ts';
import { cellKey } from '../src/core/puzzle.ts';
import type { LevelDef } from '../src/core/types.ts';

const dir = join(import.meta.dirname, '../src/levels');
const showSteps = process.argv.includes('--steps');
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const def = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelDef;
  try {
    const { puzzle: p, unique, alternative, rating } = analyzeLevel(def);
    const size = `${p.nRows}×${p.nCols}`;
    const status = unique ? '✔' : '✘';
    console.log(
      `${status} ${file.padEnd(28)} ${size.padEnd(5)} ${String(p.nClues).padStart(2)} peças  ` +
        `counts=${(def.counts ?? 'none').padEnd(4)}  ${rating.label.padEnd(9)} ` +
        `passos=${rating.steps.length} hipóteses=${rating.hypotheses} chutes=${rating.guesses}`,
    );
    if (!unique) {
      failed = true;
      if (alternative) {
        const diff = alternative
          .map((cell, clue) => (cell !== p.solution[clue] ? `${def.clues[clue].id} → ${cellKey(p, cell)}` : ''))
          .filter(Boolean);
        console.log(`    outra solução possível: ${diff.join(', ')}`);
      } else {
        console.log('    a solução declarada não satisfaz as regras');
      }
    }
    if (showSteps) rating.steps.forEach((st, i) => console.log(`    ${String(i + 1).padStart(2)}. ${describeStep(p, st)}`));
  } catch (err) {
    failed = true;
    console.log(`✘ ${file}\n  ${(err as Error).message}`);
  }
}

process.exit(failed ? 1 : 0);
