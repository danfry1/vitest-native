import { vi } from "vitest";

export function createEasingMock() {
  return {
    linear: vi.fn((t: number) => t),
    ease: vi.fn((t: number) => t * t * (3 - 2 * t)),
    quad: vi.fn((t: number) => t * t),
    cubic: vi.fn((t: number) => t * t * t),
    poly: vi.fn((n: number) => (t: number) => Math.pow(t, n)),
    sin: vi.fn((t: number) => 1 - Math.cos((t * Math.PI) / 2)),
    circle: vi.fn((t: number) => 1 - Math.sqrt(1 - t * t)),
    exp: vi.fn((t: number) => Math.pow(2, 10 * (t - 1))),
    elastic: vi.fn((bounciness: number = 1) => (t: number) => {
      const p = bounciness * Math.PI;
      return 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p);
    }),
    back: vi.fn(
      (s: number = 1.70158) =>
        (t: number) =>
          t * t * ((s + 1) * t - s),
    ),
    bounce: vi.fn((t: number) => {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) {
        t -= 1.5 / 2.75;
        return 7.5625 * t * t + 0.75;
      }
      if (t < 2.5 / 2.75) {
        t -= 2.25 / 2.75;
        return 7.5625 * t * t + 0.9375;
      }
      t -= 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }),
    bezier: vi.fn((x1: number, _y1: number, x2: number, _y2: number) => (t: number) => {
      // Simplified cubic bezier — accurate enough for test assertions
      const cx = 3 * x1;
      const bx = 3 * (x2 - x1) - cx;
      const ax = 1 - cx - bx;
      return ((ax * t + bx) * t + cx) * t;
    }),
    in: vi.fn((easing: Function) => easing),
    out: vi.fn((easing: Function) => (t: number) => 1 - (easing as any)(1 - t)),
    inOut: vi.fn((easing: Function) => (t: number) => {
      if (t < 0.5) return (easing as any)(t * 2) / 2;
      return 1 - (easing as any)((1 - t) * 2) / 2;
    }),
    step0: vi.fn((t: number) => (t > 0 ? 1 : 0)),
    step1: vi.fn((t: number) => (t >= 1 ? 1 : 0)),
  };
}
