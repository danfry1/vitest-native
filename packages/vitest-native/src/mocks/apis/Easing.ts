import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Cubic bezier implementation — ported from RN's Libraries/Animated/bezier.js
// which is based on https://github.com/gre/bezier-easing
// ---------------------------------------------------------------------------

const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const kSplineTableSize = 11;
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

function A(aA1: number, aA2: number) {
  return 1.0 - 3.0 * aA2 + 3.0 * aA1;
}
function B(aA1: number, aA2: number) {
  return 3.0 * aA2 - 6.0 * aA1;
}
function C(aA1: number) {
  return 3.0 * aA1;
}

function calcBezier(aT: number, aA1: number, aA2: number) {
  return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
}

function getSlope(aT: number, aA1: number, aA2: number) {
  return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
}

function binarySubdivide(aX: number, aA: number, aB: number, mX1: number, mX2: number) {
  let currentX: number;
  let currentT: number;
  let i = 0;
  let low = aA;
  let high = aB;
  do {
    currentT = low + (high - low) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) {
      high = currentT;
    } else {
      low = currentT;
    }
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT!;
}

function newtonRaphsonIterate(aX: number, aGuessT: number, mX1: number, mX2: number) {
  let guessT = aGuessT;
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    const currentSlope = getSlope(guessT, mX1, mX2);
    if (currentSlope === 0.0) return guessT;
    const currentX = calcBezier(guessT, mX1, mX2) - aX;
    guessT -= currentX / currentSlope;
  }
  return guessT;
}

function bezier(mX1: number, mY1: number, mX2: number, mY2: number): (x: number) => number {
  if (!(mX1 >= 0 && mX1 <= 1 && mX2 >= 0 && mX2 <= 1)) {
    throw new Error("bezier x values must be in [0, 1] range");
  }

  if (mX1 === mY1 && mX2 === mY2) {
    return (x: number) => x;
  }

  const sampleValues = new Float32Array(kSplineTableSize);
  for (let i = 0; i < kSplineTableSize; ++i) {
    sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
  }

  function getTForX(aX: number) {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    const dist =
      (aX - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * kSampleStepSize;

    const initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
    }
  }

  return function (x: number) {
    if (x === 0 || x === 1) return x;
    return calcBezier(getTForX(x), mY1, mY2);
  };
}

// ---------------------------------------------------------------------------
// Easing mock
// ---------------------------------------------------------------------------

export function createEasingMock() {
  const easeFn = bezier(0.42, 0, 1, 1);

  return {
    linear: vi.fn((t: number) => t),
    ease: vi.fn((t: number) => easeFn(t)),
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
        const t2 = t - 1.5 / 2.75;
        return 7.5625 * t2 * t2 + 0.75;
      }
      if (t < 2.5 / 2.75) {
        const t2 = t - 2.25 / 2.75;
        return 7.5625 * t2 * t2 + 0.9375;
      }
      const t2 = t - 2.625 / 2.75;
      return 7.5625 * t2 * t2 + 0.984375;
    }),
    bezier: vi.fn((x1: number, y1: number, x2: number, y2: number) => bezier(x1, y1, x2, y2)),
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
