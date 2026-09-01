type AudioContextCtor = new () => AudioContext;

/**
 * Lazily created AudioContext with master / sfx / music buses. Browsers only
 * allow audio after a user gesture, so `unlock()` is wired to the first
 * pointer/key event and re-run on later gestures in case the context was
 * suspended (e.g. tab switch on Safari).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private sfxMuted = false;
  private musicMuted = false;
  musicLevel = 0.22;
  sfxLevel = 0.6;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get sfx(): GainNode | null {
    return this.sfxBus;
  }

  get music(): GainNode | null {
    return this.musicBus;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxMuted ? 0 : this.sfxLevel;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicMuted ? 0 : this.musicLevel;
      this.musicBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.ramp(this.sfxBus, muted ? 0 : this.sfxLevel);
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.ramp(this.musicBus, muted ? 0 : this.musicLevel);
  }

  get isMusicMuted(): boolean {
    return this.musicMuted;
  }

  /** One second of white noise, shared by every noise-based sound. */
  noise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuf) {
      const rate = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, rate, rate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private ramp(node: GainNode | null, value: number): void {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    if (this.ctx.state !== 'running') {
      // Automation never advances on a suspended clock; set it outright.
      node.gain.value = value;
      return;
    }
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + 0.03);
  }
}

export const audio = new AudioEngine();

/** Hooks the autoplay unlock to user gestures. Idempotent. */
export function installAudioUnlock(): void {
  const handler = (): void => audio.unlock();
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
}
