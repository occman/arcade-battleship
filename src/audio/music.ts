import { audio } from './engine.ts';
import { note } from './synth.ts';

export type Theme = 'title' | 'battle';

interface Track {
  readonly type: OscillatorType | 'noise';
  readonly volume: number;
  /** Space-separated 16th-note steps: note name, '.' rest, '-' hold previous. */
  readonly steps: string;
  readonly gate?: number;
}

interface Pattern {
  readonly bpm: number;
  readonly tracks: readonly Track[];
}

const TITLE: Pattern = {
  bpm: 150,
  tracks: [
    {
      type: 'square',
      volume: 0.18,
      steps:
        'E5 . E5 . . E5 . C5 E5 . G5 . . . G4 . ' +
        'C5 . . G4 . . E4 . . A4 . B4 . Bb4 A4 . ' +
        'G4 E5 G5 A5 . F5 G5 . E5 . C5 D5 B4 . . . ' +
        'C5 . . G4 . . E4 . . A4 . B4 . Bb4 A4 . ',
    },
    {
      type: 'triangle',
      volume: 0.32,
      steps:
        'C3 . C3 . G2 . G2 . A2 . A2 . E2 . E2 . ' +
        'F2 . F2 . C3 . C3 . G2 . G2 . G2 . G2 . ' +
        'C3 . C3 . G2 . G2 . A2 . A2 . E2 . E2 . ' +
        'F2 . F2 . C3 . C3 . G2 . G2 . C3 . . . ',
    },
    {
      type: 'noise',
      volume: 0.12,
      steps: 'X . x . X . x . X . x . X . x x '.repeat(4),
    },
  ],
};

const BATTLE: Pattern = {
  bpm: 128,
  tracks: [
    {
      type: 'square',
      volume: 0.14,
      steps:
        'D5 . . . . . F5 . D5 . . . A4 . . . ' +
        'D5 . . . . . F5 . G5 . . . A5 . . . ' +
        'Bb5 . . . A5 . . . G5 . . . F5 . . . ' +
        'E5 . . . F5 . . . D5 . . . . . . . ',
    },
    {
      type: 'sawtooth',
      volume: 0.2,
      gate: 0.55,
      steps:
        'D2 . D2 . D2 . D3 . D2 . D2 . D2 . C3 . ' +
        'D2 . D2 . D2 . D3 . D2 . D2 . D2 . F3 . ' +
        'Bb2 . Bb2 . Bb2 . Bb3 . A2 . A2 . A2 . A3 . ' +
        'G2 . G2 . G2 . G3 . A2 . A2 . A2 . A2 . ',
    },
    {
      type: 'noise',
      volume: 0.1,
      steps: 'X . . . x . . . X . . . x . x . '.repeat(4),
    },
  ],
};

const PATTERNS: Record<Theme, Pattern> = { title: TITLE, battle: BATTLE };

/**
 * Lookahead step sequencer: a timer wakes every 25 ms and schedules any steps
 * that fall within the next 120 ms on the AudioContext clock, so timing is
 * rock solid even if the main thread stutters.
 */
class MusicPlayer {
  private theme: Theme | null = null;
  private timer = 0;
  private nextStepTime = 0;
  private step = 0;

  get current(): Theme | null {
    return this.theme;
  }

  play(theme: Theme): void {
    if (this.theme === theme) return;
    this.stop();
    this.theme = theme;
    this.step = 0;
    this.nextStepTime = audio.now + 0.05;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.theme = null;
  }

  private tick(): void {
    const ctx = audio.context;
    if (!ctx || !this.theme) {
      // Wait for the autoplay unlock; keep the clock moving so we start cleanly.
      this.nextStepTime = audio.now + 0.05;
      return;
    }
    if (audio.isMusicMuted) {
      this.nextStepTime = ctx.currentTime + 0.05;
      return;
    }
    const pattern = PATTERNS[this.theme];
    const stepDur = 60 / pattern.bpm / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.scheduleStep(pattern, this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private scheduleStep(pattern: Pattern, step: number, time: number, stepDur: number): void {
    const ctx = audio.context;
    const bus = audio.music;
    if (!ctx || !bus) return;
    for (const track of pattern.tracks) {
      const cells = track.steps.trim().split(/\s+/);
      const cell = cells[step % cells.length] ?? '.';
      if (cell === '.' || cell === '-') continue;

      if (track.type === 'noise') {
        const buffer = audio.noise();
        if (!buffer) continue;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = cell === 'X' ? 5000 : 8000;
        const g = ctx.createGain();
        const vol = track.volume * (cell === 'X' ? 1 : 0.5);
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        src.connect(f).connect(g).connect(bus);
        src.start(time);
        src.stop(time + 0.06);
        continue;
      }

      // Hold ('-') cells extend the note.
      let length = 1;
      while ((cells[(step + length) % cells.length] ?? '.') === '-') length++;
      const dur = stepDur * length * (track.gate ?? 0.9);
      const osc = ctx.createOscillator();
      osc.type = track.type;
      osc.frequency.value = note(cell);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(track.volume, time + 0.008);
      g.gain.setValueAtTime(track.volume, time + Math.max(0.01, dur - 0.03));
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g).connect(bus);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }
  }
}

export const music = new MusicPlayer();
