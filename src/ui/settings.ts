import { audio } from '../audio/engine.ts';
import { setReducedFx } from '../render/effects.ts';
import { loadSettings, saveSettings, type Settings } from '../storage.ts';

type Listener = (settings: Settings) => void;

/** Persisted user settings with side effects applied on every change. */
class SettingsStore {
  private value: Settings = loadSettings();
  private readonly listeners = new Set<Listener>();

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    saveSettings(this.value);
    this.apply();
    for (const fn of this.listeners) fn(this.value);
  }

  toggle(key: keyof Settings): void {
    this.set({ [key]: !this.value[key] });
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Push the current values into the audio engine, effects system and DOM. */
  apply(): void {
    audio.setSfxMuted(!this.value.sfx);
    audio.setMusicMuted(!this.value.music);
    setReducedFx(this.value.reduceFx);
    document.body.classList.toggle('crt', this.value.crt);
    document.body.classList.toggle('reduce-fx', this.value.reduceFx);
  }
}

export const settings = new SettingsStore();
