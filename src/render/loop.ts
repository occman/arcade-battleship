export type FrameFn = (now: number, dt: number) => void;

/** One requestAnimationFrame loop shared by every canvas; dt is clamped to 50 ms. */
class Loop {
  private readonly fns = new Set<FrameFn>();
  private handle = 0;
  private last = 0;

  add(fn: FrameFn): () => void {
    this.fns.add(fn);
    this.start();
    return () => {
      this.fns.delete(fn);
      if (this.fns.size === 0) this.stop();
    };
  }

  private start(): void {
    if (this.handle) return;
    this.last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(50, now - this.last);
      this.last = now;
      for (const fn of [...this.fns]) fn(now, dt);
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.handle) cancelAnimationFrame(this.handle);
    this.handle = 0;
  }
}

export const loop = new Loop();

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInQuad = (t: number): number => clamp01(t) * clamp01(t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
