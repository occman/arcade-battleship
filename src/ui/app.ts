import { music, type Theme } from '../audio/music.ts';
import { createAI } from '../core/ai/index.ts';
import type { Difficulty } from '../core/constants.ts';
import { Game } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { clear } from './dom.ts';

export type ScreenName = 'title' | 'difficulty' | 'placement' | 'battle' | 'gameover' | 'highscores';

export interface Screen {
  destroy(): void;
}

export type ScreenFactory = (app: App, root: HTMLElement) => Screen;

/** Screen router plus the little bit of state that outlives a single screen. */
export class App {
  readonly root: HTMLElement;
  difficulty: Difficulty = 'lieutenant';
  game: Game | null = null;
  private readonly screens: Partial<Record<ScreenName, ScreenFactory>> = {};
  private current: Screen | null = null;
  private currentName: ScreenName | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  register(name: ScreenName, factory: ScreenFactory): void {
    this.screens[name] = factory;
  }

  go(name: ScreenName): void {
    const factory = this.screens[name];
    if (!factory) throw new Error(`No screen ${name}`);
    this.current?.destroy();
    clear(this.root);
    this.root.dataset['screen'] = name;
    this.currentName = name;
    const el = document.createElement('section');
    el.className = `screen screen-${name}`;
    this.root.append(el);
    this.current = factory(this, el);
  }

  get screen(): ScreenName | null {
    return this.currentName;
  }

  playMusic(theme: Theme | null): void {
    if (theme) music.play(theme);
    else music.stop();
  }

  newGame(difficulty: Difficulty): Game {
    this.difficulty = difficulty;
    const rng = createRng();
    this.game = new Game({ difficulty, ai: createAI(difficulty, rng), rng });
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = this.game;
    return this.game;
  }
}
