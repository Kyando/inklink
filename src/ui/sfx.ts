/** Tiny synthesized sound effects — no audio files needed while prototyping. */
export class Sfx {
  enabled: boolean;
  private ctx: AudioContext | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  pick(): void {
    this.tone(620, 0.07, 'triangle', 0.07, 0, 760);
  }

  drop(): void {
    this.tone(300, 0.1, 'triangle', 0.12, 0, 170);
    this.tone(880, 0.05, 'sine', 0.04, 0.03);
  }

  note(): void {
    this.tone(1250, 0.04, 'sine', 0.05);
  }

  nope(): void {
    this.tone(210, 0.16, 'square', 0.035, 0, 150);
  }

  hint(): void {
    this.tone(740, 0.12, 'sine', 0.06);
    this.tone(990, 0.16, 'sine', 0.05, 0.09);
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, i * 0.085));
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    if (!this.enabled) return;
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Audio unavailable; stay silent.
    }
  }
}
