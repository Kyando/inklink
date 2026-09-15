import { colOf, rowOf, type Puzzle } from './puzzle.ts';
import type { Contradiction, Step } from './deduce.ts';

export const clueName = (p: Puzzle, clue: number): string => {
  const c = p.def.clues[clue];
  return `${c.label}`;
};

export const cellName = (p: Puzzle, cell: number): string =>
  `${p.def.rows[rowOf(p, cell)].label} × ${p.def.cols[colOf(p, cell)].label}`;

export const lineName = (p: Puzzle, l: number): string => {
  const line = p.lines[l];
  const word = line.kind === 'row' ? p.def.rows[line.index] : p.def.cols[line.index];
  return `${line.kind === 'row' ? 'a linha' : 'a coluna'} ${word.label}`;
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

function describeContradiction(p: Puzzle, c: Contradiction): string {
  switch (c.type) {
    case 'noCell':
      return `${clueName(p, c.clue)} ficaria sem lugar`;
    case 'lineOver':
      return `${lineName(p, c.line)} teria peças demais`;
    case 'lineShort':
      return `${lineName(p, c.line)} não conseguiria receber ${plural(p.lines[c.line].count ?? 0, 'peça', 'peças')}`;
  }
}

export function describeStep(p: Puzzle, step: Step): string {
  switch (step.technique) {
    case 'single':
      return `${clueName(p, step.clue)} só pode ir em ${cellName(p, step.cell)}.`;
    case 'hiddenSingle':
      return step.line === null
        ? `Todo quadro recebe uma peça, e só ${clueName(p, step.clue)} combina com ${cellName(p, step.cell)}.`
        : `${capitalize(lineName(p, step.line))} precisa preencher ${cellName(p, step.cell)}, e só ${clueName(p, step.clue)} combina com ele.`;
    case 'lineFull':
      return `${capitalize(lineName(p, step.line))} já tem ${plural(p.lines[step.line].count ?? 0, 'peça', 'peças')}, então nenhuma outra entra nela.`;
    case 'lineNeeds': {
      const count = p.lines[step.line].count ?? 0;
      const names = list(step.clues.map((c) => clueName(p, c)));
      return `${capitalize(lineName(p, step.line))} recebe ${plural(count, 'peça', 'peças')} e só ${names} ainda cabem nela — então elas ficam lá.`;
    }
    case 'hypothesis':
      return `Se ${clueName(p, step.clue)} fosse para ${cellName(p, step.cell)}, ${describeContradiction(p, step.contradiction)}. Então não é lá.`;
    case 'guess':
      return `Tente ${clueName(p, step.clue)} em ${cellName(p, step.cell)}.`;
  }
}
