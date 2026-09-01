import type { Difficulty } from '../constants.ts';
import type { Rng } from '../rng.ts';
import { AdmiralStrategy } from './admiral.ts';
import { CadetStrategy } from './cadet.ts';
import { CaptainStrategy } from './captain.ts';
import { LieutenantStrategy } from './lieutenant.ts';
import type { AIStrategy } from './types.ts';

export function createAI(difficulty: Difficulty, rng: Rng): AIStrategy {
  switch (difficulty) {
    case 'cadet':
      return new CadetStrategy(rng);
    case 'lieutenant':
      return new LieutenantStrategy(rng);
    case 'captain':
      return new CaptainStrategy(rng);
    case 'admiral':
      return new AdmiralStrategy(rng);
  }
}

export type { AIStrategy, ShotFeedback, ShotView } from './types.ts';
