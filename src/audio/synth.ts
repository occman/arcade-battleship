import { audio } from './engine.ts';

export interface ToneOptions {
  readonly type?: OscillatorType;
  readonly freq: number;
  /** Glide to this frequency over the duration. */
  readonly freqEnd?: number;
  readonly duration: number;
  readonly volume?: number;
  readonly attack?: number;
  /** Seconds from now to start. */
  readonly when?: number;
  readonly bus?: 'sfx' | 'music';
  readonly detune?: number;
}

export interface NoiseOptions {
  readonly duration: number;
  readonly volume?: number;
  readonly filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
  readonly attack?: number;
  readonly when?: number;
  readonly bus?: 'sfx' | 'music';
}

function bus(name: 'sfx' | 'music' | undefined): AudioNode | null {
  return name === 'music' ? audio.music : audio.sfx;
}

function envelope(ctx: AudioContext, start: number, duration: number, volume: number, attack: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(volume, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  return g;
}

/** Oscillator with an attack/decay envelope and optional pitch glide. */
export function tone(o: ToneOptions): void {
  const ctx = audio.context;
  const out = bus(o.bus);
  if (!ctx || !out) return;
  const start = ctx.currentTime + (o.when ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), start + o.duration);
  if (o.detune) osc.detune.value = o.detune;
  const g = envelope(ctx, start, o.duration, o.volume ?? 0.3, o.attack ?? 0.005);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + o.duration + 0.05);
}

/** Filtered white noise burst. */
export function noise(o: NoiseOptions): void {
  const ctx = audio.context;
  const out = bus(o.bus);
  const buffer = audio.noise();
  if (!ctx || !out || !buffer) return;
  const start = ctx.currentTime + (o.when ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  let node: AudioNode = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, start);
    if (o.filter.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.freqEnd), start + o.duration);
    f.Q.value = o.filter.q ?? 1;
    node.connect(f);
    node = f;
  }
  const g = envelope(ctx, start, o.duration, o.volume ?? 0.3, o.attack ?? 0.005);
  node.connect(g).connect(out);
  src.start(start);
  src.stop(start + o.duration + 0.05);
}

/** Plays notes one after another. */
export function arp(freqs: readonly number[], step: number, o: Omit<ToneOptions, 'freq' | 'when'>): void {
  freqs.forEach((f, i) => tone({ ...o, freq: f, when: i * step }));
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4", "F#5", "Bb3" -> Hz. */
export function note(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note ${name}`);
  const [, letter, accidental, octave] = m;
  const semis = (NOTE_INDEX[letter as string] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
