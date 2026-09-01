import { arp, noise, note, tone } from './synth.ts';

/** Every sound effect in the game, all synthesised. */
export const sfx = {
  click(): void {
    tone({ type: 'square', freq: 880, duration: 0.05, volume: 0.12 });
  },
  hover(): void {
    tone({ type: 'square', freq: 1320, duration: 0.025, volume: 0.04 });
  },
  menuMove(): void {
    tone({ type: 'square', freq: 660, freqEnd: 760, duration: 0.06, volume: 0.1 });
  },
  select(): void {
    tone({ type: 'square', freq: 523, duration: 0.07, volume: 0.15 });
    tone({ type: 'square', freq: 784, duration: 0.12, volume: 0.15, when: 0.07 });
  },
  place(): void {
    tone({ type: 'square', freq: 440, freqEnd: 660, duration: 0.09, volume: 0.15 });
    noise({ duration: 0.08, volume: 0.08, filter: { type: 'highpass', freq: 2000 } });
  },
  pickUp(): void {
    tone({ type: 'square', freq: 660, freqEnd: 440, duration: 0.09, volume: 0.12 });
  },
  rotate(): void {
    tone({ type: 'triangle', freq: 700, freqEnd: 900, duration: 0.05, volume: 0.12 });
  },
  invalid(): void {
    tone({ type: 'sawtooth', freq: 170, duration: 0.12, volume: 0.18 });
    tone({ type: 'sawtooth', freq: 120, duration: 0.16, volume: 0.15, when: 0.1 });
  },
  launch(): void {
    noise({ duration: 0.3, volume: 0.25, filter: { type: 'bandpass', freq: 900, freqEnd: 180, q: 1.2 } });
    tone({ type: 'triangle', freq: 1000, freqEnd: 240, duration: 0.3, volume: 0.12 });
  },
  hit(): void {
    noise({ duration: 0.45, volume: 0.7, filter: { type: 'lowpass', freq: 1500, freqEnd: 80 } });
    tone({ type: 'square', freq: 110, freqEnd: 38, duration: 0.35, volume: 0.45 });
    tone({ type: 'sawtooth', freq: 60, freqEnd: 30, duration: 0.4, volume: 0.3, when: 0.02 });
  },
  splash(): void {
    noise({ duration: 0.3, volume: 0.32, filter: { type: 'bandpass', freq: 1800, freqEnd: 500, q: 0.8 } });
    tone({ type: 'sine', freq: 520, freqEnd: 220, duration: 0.22, volume: 0.12 });
  },
  sunk(): void {
    noise({ duration: 0.9, volume: 0.55, filter: { type: 'lowpass', freq: 600, freqEnd: 40 }, attack: 0.02 });
    arp([note('A3'), note('F3'), note('D3')], 0.14, { type: 'square', duration: 0.22, volume: 0.28 });
    tone({ type: 'square', freq: 55, freqEnd: 28, duration: 0.7, volume: 0.35, when: 0.4 });
  },
  reticleTick(): void {
    tone({ type: 'square', freq: 1500, duration: 0.018, volume: 0.06 });
  },
  lockOn(): void {
    tone({ type: 'square', freq: 1900, duration: 0.05, volume: 0.12 });
    tone({ type: 'square', freq: 1900, duration: 0.05, volume: 0.12, when: 0.09 });
  },
  yourTurn(): void {
    tone({ type: 'square', freq: 660, duration: 0.05, volume: 0.09 });
    tone({ type: 'square', freq: 880, duration: 0.08, volume: 0.09, when: 0.06 });
  },
  battleStart(): void {
    arp([note('C4'), note('E4'), note('G4'), note('C5')], 0.08, { type: 'square', duration: 0.16, volume: 0.2 });
    tone({ type: 'sawtooth', freq: 65, freqEnd: 130, duration: 0.5, volume: 0.2 });
  },
  victory(): void {
    const lead = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6', 'G6'].map(note);
    arp(lead, 0.11, { type: 'square', duration: 0.22, volume: 0.22 });
    arp([note('C3'), note('G3'), note('C4'), note('G3')], 0.22, { type: 'triangle', duration: 0.4, volume: 0.25 });
    tone({ type: 'square', freq: note('C6'), duration: 0.9, volume: 0.15, when: 0.9 });
  },
  defeat(): void {
    arp(['E4', 'Eb4', 'D4', 'Db4', 'C4'].map(note), 0.26, { type: 'sawtooth', duration: 0.45, volume: 0.2 });
    tone({ type: 'square', freq: note('C3'), freqEnd: note('C2'), duration: 1.4, volume: 0.22, when: 1.2 });
  },
  highScore(): void {
    arp(['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'E6', 'G6'].map(note), 0.06, { type: 'square', duration: 0.14, volume: 0.16 });
    tone({ type: 'triangle', freq: note('C6'), duration: 0.6, volume: 0.14, when: 0.5 });
  },
  type(): void {
    tone({ type: 'square', freq: 990, duration: 0.03, volume: 0.08 });
  },
};

export type SfxName = keyof typeof sfx;
