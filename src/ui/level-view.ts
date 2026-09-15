import { cellsOf, rowOf, colOf } from '../core/puzzle.ts';
import type { WordDef } from '../core/types.ts';
import type { Session } from '../game/session.ts';
import { h, icon, label, svg } from './dom.ts';
import { makeDraggable } from './drag.ts';
import { burst, flip, replay } from './fx.ts';
import { ICONS } from './icons.ts';
import { toast } from './overlay.ts';
import type { Sfx } from './sfx.ts';

export interface LevelViewOptions {
  session: Session;
  number: number;
  total: number;
  sfx: Sfx;
  onSolved(): void;
  onHint(lines: string[]): void;
}

type DropTarget = number | 'tray' | null;

const TINTS = 8;
const HEADER_RATIO = 0.72;
const RADII = ['16px 12px 17px 13px', '12px 17px 13px 16px', '17px 14px 12px 15px', '13px 16px 15px 12px'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class LevelView {
  readonly el: HTMLElement;
  private readonly s: Session;
  private readonly opts: LevelViewOptions;
  private readonly boardWrap: HTMLElement;
  private readonly board: HTMLElement;
  private readonly trayCount: HTMLElement;
  private readonly cells: HTMLElement[] = [];
  private readonly pieces: HTMLElement[] = [];
  private readonly slots: HTMLElement[] = [];
  private readonly badges: (HTMLElement | null)[] = [];
  private readonly undoBtn: HTMLButtonElement;
  private readonly notesBtn: HTMLButtonElement;
  private readonly checkBtn: HTMLButtonElement;
  private readonly resizeObserver: ResizeObserver;
  private selected = -1;
  private notesMode = false;
  private hovered: HTMLElement | null = null;

  constructor(opts: LevelViewOptions) {
    this.opts = opts;
    this.s = opts.session;
    const p = this.s.puzzle;
    const def = p.def;

    // Chapter heading
    const rating = this.s.rating;
    const heading = h(
      'header',
      { class: 'chapter' },
      h(
        'p',
        { class: 'eyebrow' },
        h('span', {}, `Capítulo ${opts.number} de ${opts.total}`),
        h(
          'span',
          { class: 'difficulty', title: `Dificuldade: ${rating.label}` },
          ...[1, 2, 3].map((i) => h('i', { class: i <= rating.level ? 'on' : '' })),
          rating.label,
        ),
      ),
      h('h1', {}, def.title),
      def.subtitle ? h('p', { class: 'subtitle' }, def.subtitle) : null,
    );

    // Board
    this.board = h('div', { class: 'board', 'aria-label': 'Tabuleiro' });
    this.board.style.setProperty('--rows', String(p.nRows));
    this.board.style.setProperty('--cols', String(p.nCols));
    this.board.append(h('div', { class: 'corner', 'aria-hidden': 'true' }, '✦'));
    def.cols.forEach((word, c) => this.board.append(this.wordCard(word, 'col', p.nRows + c)));
    def.rows.forEach((row, r) => {
      this.board.append(this.wordCard(row, 'row', r));
      def.cols.forEach((col, c) => this.board.append(this.makeCell(row, col, r * p.nCols + c)));
    });
    this.boardWrap = h('div', { class: 'board-wrap' }, this.board);

    // Tray
    this.trayCount = h('span', { class: 'tray-count' });
    const tray = h('div', { class: 'tray' });
    def.clues.forEach((_, i) => {
      const slot = h('div', { class: 'slot' }, this.makePiece(i));
      this.slots.push(slot);
      tray.append(slot);
    });
    const trayPanel = h(
      'section',
      { class: 'tray-panel', 'aria-label': 'Peças' },
      h('div', { class: 'tray-head' }, h('span', {}, 'Peças'), this.trayCount),
      tray,
    );
    trayPanel.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('.piece')) this.onTrayTap();
    });

    // Actions
    const button = (label: string, glyph: string, onClick: () => void, extra = '') =>
      h('button', { type: 'button', class: `btn ${extra}`, onclick: onClick }, svg(glyph), h('span', { class: 'btn-label' }, label));
    this.undoBtn = button('Desfazer', ICONS.undo, () => this.undo());
    this.notesBtn = button('Anotar', ICONS.pencil, () => this.toggleNotes());
    this.notesBtn.setAttribute('aria-pressed', 'false');
    const hintBtn = button('Dica', ICONS.bulb, () => this.showHint());
    const restartBtn = button('Recomeçar', ICONS.restart, () => this.restart(), 'btn--ghost');
    this.checkBtn = button('Verificar', ICONS.check, () => this.check(), 'btn--primary');
    const actions = h('nav', { class: 'actions', 'aria-label': 'Ações' }, restartBtn, this.undoBtn, this.notesBtn, hintBtn, this.checkBtn);

    this.el = h('main', { class: 'stage' }, heading, h('div', { class: 'play' }, this.boardWrap, trayPanel), actions);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.boardWrap);
    this.sync();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  // ── building ────────────────────────────────────────────────────────────

  private wordCard(word: WordDef, kind: 'row' | 'col', line: number): HTMLElement {
    const info = this.s.puzzle.lines[line];
    const badge = info.shown
      ? h('span', { class: 'count', title: `Recebe ${plural(info.count ?? 0, 'peça', 'peças')}` })
      : null;
    this.badges[line] = badge;
    return h('div', { class: `word word--${kind}` }, icon(word.icon, 'word-icon'), label(word.label, 'word-label', kind === 'row' ? 6 : 9), badge);
  }

  private makeCell(row: WordDef, col: WordDef, index: number): HTMLElement {
    const p = this.s.puzzle;
    const cell = h(
      'div',
      {
        class: 'cell',
        role: 'button',
        tabindex: 0,
        'aria-label': `${row.label} com ${col.label}`,
        style: `border-radius: ${RADII[(rowOf(p, index) * 3 + colOf(p, index)) % RADII.length]}`,
      },
      h('span', { class: 'cell-pair', 'aria-hidden': 'true' }, icon(row.icon, 'mini'), icon(col.icon, 'mini')),
      h('span', { class: 'cell-notes', 'aria-hidden': 'true' }),
      h('span', { class: 'cell-slot' }),
    );
    cell.addEventListener('click', () => this.onCellTap(index));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onCellTap(index);
      }
    });
    this.cells.push(cell);
    return cell;
  }

  private makePiece(clue: number): HTMLElement {
    const def = this.s.puzzle.def.clues[clue];
    const tilt = ((clue * 37) % 7) - 3;
    const piece = h(
      'div',
      {
        class: 'piece',
        role: 'button',
        tabindex: 0,
        'aria-label': def.label,
        'data-tint': clue % TINTS,
        style: `--tilt: ${tilt}deg`,
      },
      h('span', { class: 'piece-card' }, icon(def.icon, 'piece-icon'), label(def.label, 'piece-label', 8)),
    );
    piece.addEventListener('click', (e) => e.stopPropagation());
    piece.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.onPieceTap(clue);
      }
    });
    makeDraggable(piece, {
      onTap: () => this.onPieceTap(clue),
      onStart: () => {
        this.selected = -1;
        this.board.classList.add('is-dragging');
        this.opts.sfx.pick();
        this.sync();
      },
      onMove: (x, y) => this.hover(this.dropTarget(x, y)),
      onDrop: (x, y, ghostRect) => {
        this.hover(null);
        this.board.classList.remove('is-dragging');
        const target = this.dropTarget(x, y);
        const from = new Map([[clue, ghostRect]]);
        if (target === null) this.sync(from);
        else this.moveTo(clue, target === 'tray' ? null : target, from);
      },
    });
    this.pieces.push(piece);
    return piece;
  }

  // ── interaction ─────────────────────────────────────────────────────────

  private dropTarget(x: number, y: number): DropTarget {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest<HTMLElement>('.cell');
    if (cell) return this.cells.indexOf(cell);
    return el?.closest('.tray-panel') ? 'tray' : null;
  }

  private hover(target: DropTarget): void {
    const next = typeof target === 'number' ? this.cells[target] : null;
    if (next === this.hovered) return;
    this.hovered?.classList.remove('is-hover');
    next?.classList.add('is-hover');
    this.hovered = next;
  }

  private onPieceTap(clue: number): void {
    const at = this.s.placement[clue];
    // With another piece in hand, tapping a placed piece means "put it here".
    if (this.selected >= 0 && this.selected !== clue && at >= 0) {
      this.onCellTap(at);
      return;
    }
    this.selected = this.selected === clue ? -1 : clue;
    if (this.selected >= 0) this.opts.sfx.pick();
    this.sync();
  }

  private onCellTap(cell: number): void {
    const occupant = this.s.clueAt(cell);
    if (this.selected >= 0) {
      if (this.notesMode) {
        if (occupant >= 0) return;
        this.s.toggleNote(this.selected, cell);
        this.opts.sfx.note();
        this.sync();
      } else {
        this.moveTo(this.selected, cell);
      }
      return;
    }
    if (occupant >= 0) {
      this.selected = occupant;
      this.opts.sfx.pick();
      this.sync();
    } else if (this.notesMode) {
      toast('Selecione uma peça para anotar');
    }
  }

  private onTrayTap(): void {
    if (this.selected < 0) return;
    if (this.s.placement[this.selected] >= 0) this.moveTo(this.selected, null);
    else {
      this.selected = -1;
      this.sync();
    }
  }

  private moveTo(clue: number, cell: number | null, from?: Map<number, DOMRect>): void {
    const occupant = cell === null ? -1 : this.s.clueAt(cell);
    const moved = this.s.move(clue, cell);
    this.selected = -1;
    this.sync(from);
    if (!moved) return;
    this.opts.sfx.drop();
    replay(this.pieces[clue], 'pop');
    if (occupant >= 0 && occupant !== clue) replay(this.pieces[occupant], 'pop');
  }

  private undo(): void {
    if (!this.s.undo()) return;
    this.selected = -1;
    this.sync();
  }

  private restart(): void {
    if (!this.s.placedCount && !this.s.notes.some(Boolean)) return;
    this.s.reset();
    this.selected = -1;
    this.sync();
    toast('Tabuleiro limpo. Dá para desfazer.');
  }

  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    this.notesBtn.setAttribute('aria-pressed', String(this.notesMode));
    if (this.notesMode) toast('Anotação: selecione uma peça e toque nos quadros');
    this.sync();
  }

  private showHint(): void {
    const hint = this.s.hint();
    if (!hint) {
      toast('Tudo certo até aqui. Pode verificar!');
      return;
    }
    this.opts.sfx.hint();
    this.selected = -1;
    this.sync();
    replay(this.pieces[hint.clue], 'nudge');
    this.opts.onHint(hint.lines);
  }

  private check(): void {
    const p = this.s.puzzle;
    if (!this.s.allPlaced) {
      const missing = p.nClues - this.s.placedCount;
      toast(`Falta${missing === 1 ? '' : 'm'} ${plural(missing, 'peça', 'peças')} no tabuleiro`);
      this.opts.sfx.nope();
      this.pieces.forEach((pc, i) => this.s.placement[i] < 0 && replay(pc, 'nudge'));
      return;
    }
    const result = this.s.check();
    if (result.solved) {
      this.celebrate();
      return;
    }
    this.opts.sfx.nope();
    replay(this.board, 'shake');
    toast(`${result.correct} de ${result.total} peças no lugar certo`);
  }

  private celebrate(): void {
    const p = this.s.puzzle;
    this.selected = -1;
    this.sync();
    this.opts.sfx.win();
    this.s.placement.forEach((cell) => {
      const el = this.cells[cell];
      el.style.setProperty('--delay', `${(rowOf(p, cell) + colOf(p, cell)) * 70}ms`);
      replay(el, 'celebrate');
    });
    const r = this.board.getBoundingClientRect();
    const glyphs = p.def.clues.map((c) => c.icon).filter((g) => !/\.(svg|png|webp)$/i.test(g));
    burst(r.left + r.width / 2, r.top + r.height / 2, [...glyphs, '✨', '⭐']);
    window.setTimeout(() => this.opts.onSolved(), 1150);
  }

  // ── rendering ───────────────────────────────────────────────────────────

  /** Reflects session state in the DOM, animating pieces that changed place. */
  private sync(from?: Map<number, DOMRect>): void {
    const p = this.s.puzzle;
    const firsts = this.pieces.map((pc, i) => from?.get(i) ?? pc.getBoundingClientRect());

    this.pieces.forEach((pc, i) => {
      const cell = this.s.placement[i];
      const target = cell >= 0 ? this.cells[cell].querySelector('.cell-slot')! : this.slots[i];
      if (pc.parentElement !== target) target.append(pc);
      pc.classList.toggle('is-placed', cell >= 0);
      pc.classList.toggle('is-selected', this.selected === i);
      this.slots[i].classList.toggle('is-empty', cell >= 0);
    });

    this.cells.forEach((el, cell) => {
      el.classList.toggle('has-piece', this.s.clueAt(cell) >= 0);
      el.querySelector('.cell-notes')!.replaceChildren(
        ...cellsOf(this.s.notes[cell]).map((clue) => icon(p.def.clues[clue].icon, 'note')),
      );
    });

    this.badges.forEach((badge, line) => {
      if (!badge) return;
      const need = p.lines[line].count ?? 0;
      const used = this.s.lineUsage(line);
      badge.textContent = String(need);
      badge.dataset.state = used === need ? 'ok' : used > need ? 'over' : '';
    });

    this.board.classList.toggle('is-notes', this.notesMode);
    this.board.classList.toggle('has-selection', this.selected >= 0);
    this.trayCount.textContent = `${this.s.placedCount}/${p.nClues}`;
    this.undoBtn.disabled = !this.s.canUndo;
    this.checkBtn.classList.toggle('is-ready', this.s.allPlaced);

    this.pieces.forEach((pc, i) => flip(pc, firsts[i]));
  }

  /** Sizes cells to the space available. */
  private fit(): void {
    const p = this.s.puzzle;
    const { width, height } = this.boardWrap.getBoundingClientRect();
    const gap = width < 480 ? 6 : 9;
    const byWidth = (width - gap * p.nCols) / (p.nCols + HEADER_RATIO);
    const byHeight = (height - gap * p.nRows) / (p.nRows + HEADER_RATIO);
    const size = Math.max(44, Math.min(150, Math.floor(Math.min(byWidth, byHeight))));
    this.el.style.setProperty('--cell', `${size}px`);
    this.el.style.setProperty('--gap', `${gap}px`);
  }
}
