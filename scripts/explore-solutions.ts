/**
 * Authoring helper: lists the solutions (and counts modes) that make a level unique,
 * hardest first. Useful when you have words + candidates but haven't chosen the answer yet.
 *   npm run levels:explore -- src/levels/05-contos.json [--top 5]
 */
import { readFileSync } from 'node:fs';
import { exploreSolutions } from '../src/core/analyze.ts';
import type { LevelDef } from '../src/core/types.ts';

const file = process.argv[2];
if (!file) {
  console.error('uso: npm run levels:explore -- <arquivo.json> [--top N]');
  process.exit(1);
}
const topArg = process.argv.indexOf('--top');
const top = topArg > 0 ? Number(process.argv[topArg + 1]) : 5;

const def = JSON.parse(readFileSync(file, 'utf8')) as LevelDef;
const { options, assignments, truncated } = exploreSolutions(def);

console.log(`${assignments} distribuições testadas${truncated ? ' (truncado)' : ''}, ${options.length} com solução única.\n`);
for (const opt of options.slice(0, top)) {
  console.log(
    `${opt.rating.label} · counts=${opt.counts} · hipóteses=${opt.rating.hypotheses} · passos=${opt.rating.steps.length}`,
  );
  console.log(`  "counts": "${opt.counts}",\n  "solution": ${JSON.stringify(opt.solution)}\n`);
}
