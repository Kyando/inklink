import type { Session as SessionType } from '../game/session.ts';
import { Session } from '../game/session.ts';
import { emptyProgress, loadSave, writeSave, type ThemeChoice } from '../game/save.ts';
import { CATALOG } from '../levels/catalog.ts';
import { h, icon, svg } from './dom.ts';
import { ICONS } from './icons.ts';
import { LevelView } from './level-view.ts';
import { openModal, toast } from './overlay.ts';
import { Sfx } from './sfx.ts';

const GAME_NAME = 'Inklink';
const THEME_LABEL: Record<ThemeChoice, string> = { system: 'do sistema', light: 'claro', dark: 'escuro' };

const iconButton = (label: string, glyph: string, onClick: () => void) =>
  h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: onClick }, svg(glyph));

export class App {
  private readonly save = loadSave();
  private readonly sfx = new Sfx(this.save.settings.sound);
  private readonly main: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  private view: LevelView | null = null;
  private index = 0;

  constructor(root: HTMLElement) {
    this.applyTheme();
    this.soundBtn = iconButton('Som', ICONS.soundOn, () => this.toggleSound());
    this.updateSoundIcon();

    const header = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'topbar-side' }, iconButton('Capítulos', ICONS.book, () => this.openChapters())),
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '✦'), GAME_NAME),
      h(
        'div',
        { class: 'topbar-side end' },
        iconButton('Como jogar', ICONS.help, () => this.openHelp()),
        this.soundBtn,
        iconButton('Tema', ICONS.theme, () => this.cycleTheme()),
      ),
    );
    this.main = h('div', { class: 'main' });
    root.append(header, this.main);

    if (!CATALOG.length) {
      this.main.append(h('p', { class: 'empty' }, 'Nenhum nível válido encontrado em src/levels.'));
      return;
    }
    const last = CATALOG.findIndex((l) => l.def.id === this.save.settings.lastLevel);
    const firstOpen = CATALOG.findIndex((l) => !this.save.levels[l.def.id]?.done);
    this.openLevel(last >= 0 ? last : Math.max(0, firstOpen));

    if (!this.save.settings.seenHelp) {
      this.save.settings.seenHelp = true;
      this.persist();
      this.openHelp();
    }
  }

  private persist(): void {
    writeSave(this.save);
  }

  private openLevel(index: number): void {
    this.view?.destroy();
    this.index = index;
    const entry = CATALOG[index];
    const progress = (this.save.levels[entry.def.id] ??= emptyProgress());
    const session = new Session(entry.puzzle, entry.rating, progress, () => this.persist());
    this.view = new LevelView({
      session,
      number: index + 1,
      total: CATALOG.length,
      sfx: this.sfx,
      onSolved: () => this.showWin(session),
      onHint: (lines) => this.showHint(session, lines),
    });
    this.main.replaceChildren(this.view.el);
    this.save.settings.lastLevel = entry.def.id;
    this.persist();
  }

  // ── modals ──────────────────────────────────────────────────────────────

  private openChapters(): void {
    const modal = openModal({
      title: 'Capítulos',
      className: 'modal--chapters',
      body: h(
        'ol',
        { class: 'chapters' },
        ...CATALOG.map((entry, i) => {
          const progress = this.save.levels[entry.def.id];
          const classes = ['chapter-card', i === this.index && 'is-current', progress?.done && 'is-done'];
          return h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: classes.filter(Boolean).join(' '),
                onclick: () => {
                  modal.close();
                  this.openLevel(i);
                },
              },
              h('span', { class: 'chapter-num' }, progress?.done ? '✓' : String(i + 1)),
              h('span', { class: 'chapter-icons', 'aria-hidden': 'true' }, ...entry.def.clues.slice(0, 3).map((c) => icon(c.icon, 'mini'))),
              h('span', { class: 'chapter-title' }, entry.def.title),
              h('span', { class: 'chapter-meta' }, `${entry.puzzle.nRows}×${entry.puzzle.nCols} · ${entry.rating.label}`),
            ),
          );
        }),
      ),
    });
  }

  private openHelp(): void {
    const word = (glyph: string, label: string) =>
      h('span', { class: 'ex-word' }, h('span', { class: 'ex-icon' }, glyph), h('span', { class: 'ex-label' }, label));
    openModal({
      title: 'Como jogar',
      className: 'modal--help',
      body: h(
        'div',
        { class: 'help' },
        h('p', {}, 'Cada quadro fica entre duas palavras: a da linha e a da coluna. Arraste cada peça para o quadro onde ela combina com as duas.'),
        h(
          'div',
          { class: 'example', 'aria-label': 'Médico mais Urso combina com Veterinário' },
          word('🩺', 'Médico'),
          h('span', { class: 'ex-op' }, '+'),
          word('🐻', 'Urso'),
          h('span', { class: 'ex-op' }, '='),
          h('span', { class: 'ex-piece' }, h('span', { class: 'ex-icon' }, '🐾'), h('span', { class: 'ex-label' }, 'Veterinário')),
        ),
        h(
          'ul',
          {},
          h('li', {}, 'Cada quadro recebe ', h('b', {}, 'no máximo uma peça'), '.'),
          h('li', {}, 'Algumas peças parecem servir em mais de um lugar. Use as outras para descobrir qual é o certo.'),
          h('li', {}, 'Um ', h('b', {}, 'número'), ' numa palavra diz quantas peças aquela linha ou coluna recebe.'),
          h('li', {}, h('b', {}, 'Anotar'), ': selecione uma peça e toque nos quadros para marcar onde ela pode ir.'),
          h('li', {}, h('b', {}, 'Verificar'), ' diz quantas peças estão no lugar certo.'),
        ),
      ),
      actions: [h('button', { type: 'button', class: 'btn btn--primary', onclick: (e: Event) => (e.target as HTMLElement).closest('dialog')?.close() }, 'Vamos lá')],
    });
  }

  private showHint(session: SessionType, lines: string[]): void {
    openModal({
      title: 'Dica',
      className: 'modal--hint',
      body: h(
        'div',
        { class: 'hint' },
        h('ol', {}, ...lines.map((line, i) => h('li', { class: i === lines.length - 1 ? 'is-key' : '' }, line))),
        h('p', { class: 'hint-meta' }, `Dicas usadas neste capítulo: ${session.progress.hints}`),
      ),
    });
  }

  private showWin(session: SessionType): void {
    const { def, nClues } = session.puzzle;
    const pr = session.progress;
    const number = this.index + 1;
    const hasNext = number < CATALOG.length;
    const stat = (value: number, label: string) =>
      h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));

    const share = () => {
      const verdict = pr.checks === 1 ? '✅ de primeira' : `🔎 ${pr.checks} verificações`;
      const text = `${GAME_NAME} · Capítulo ${number} (${session.rating.label})\n${verdict} · 💡 ${pr.hints} dicas\n${'🟩'.repeat(nClues)}`;
      navigator.clipboard?.writeText(text).then(
        () => toast('Resultado copiado!'),
        () => toast('Não foi possível copiar'),
      );
    };

    const modal = openModal({
      title: 'Capítulo concluído!',
      className: 'modal--win',
      body: h(
        'div',
        { class: 'win' },
        h('div', { class: 'win-art', 'aria-hidden': 'true' }, ...def.clues.slice(0, 5).map((c) => icon(c.icon, 'win-icon'))),
        h('p', {}, `Você desvendou “${def.title}”.`),
        h('div', { class: 'stats' }, stat(pr.moves, 'movimentos'), stat(pr.checks, 'verificações'), stat(pr.hints, 'dicas')),
      ),
      actions: [
        h('button', { type: 'button', class: 'btn', onclick: share }, svg(ICONS.share), h('span', {}, 'Compartilhar')),
        hasNext
          ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => { modal.close(); this.openLevel(this.index + 1); } }, h('span', {}, 'Próximo'), svg(ICONS.arrow))
          : h('button', { type: 'button', class: 'btn btn--primary', onclick: () => { modal.close(); this.openChapters(); } }, h('span', {}, 'Capítulos')),
      ],
    });
  }

  // ── settings ────────────────────────────────────────────────────────────

  private applyTheme(): void {
    const theme = this.save.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  private cycleTheme(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(this.save.settings.theme) + 1) % order.length];
    this.save.settings.theme = next;
    this.applyTheme();
    this.persist();
    toast(`Tema ${THEME_LABEL[next]}`);
  }

  private toggleSound(): void {
    this.save.settings.sound = !this.save.settings.sound;
    this.sfx.enabled = this.save.settings.sound;
    this.updateSoundIcon();
    this.persist();
    if (this.sfx.enabled) this.sfx.pick();
  }

  private updateSoundIcon(): void {
    this.soundBtn.replaceChildren(svg(this.save.settings.sound ? ICONS.soundOn : ICONS.soundOff));
    this.soundBtn.setAttribute('aria-pressed', String(this.save.settings.sound));
  }
}
