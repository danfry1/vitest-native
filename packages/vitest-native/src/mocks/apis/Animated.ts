import React from "react";
import { vi } from "vitest";

type Extrapolate = "extend" | "clamp" | "identity";

const IDENTITY_EASING = (t: number) => t;

// RN's single-segment interpolate (Libraries/Animated/nodes/AnimatedInterpolation.js),
// including -Infinity / Infinity range handling.
function interpolateSegment(
  input: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
  easing: (t: number) => number,
  extrapolateLeft: Extrapolate,
  extrapolateRight: Extrapolate,
): number {
  let result = input;

  if (result < inputMin) {
    if (extrapolateLeft === "identity") return result;
    else if (extrapolateLeft === "clamp") result = inputMin;
  }
  if (result > inputMax) {
    if (extrapolateRight === "identity") return result;
    else if (extrapolateRight === "clamp") result = inputMax;
  }

  if (outputMin === outputMax) return outputMin;
  if (inputMin === inputMax) return input <= inputMin ? outputMin : outputMax;

  // Input range (handles infinite bounds).
  if (inputMin === -Infinity) result = -result;
  else if (inputMax === Infinity) result = result - inputMin;
  else result = (result - inputMin) / (inputMax - inputMin);

  result = easing(result);

  // Output range (handles infinite bounds).
  if (outputMin === -Infinity) result = -result;
  else if (outputMax === Infinity) result = result + outputMin;
  else result = result * (outputMax - outputMin) + outputMin;

  return result;
}

// Pick the segment index for `input` (mirrors RN's findRange).
function findRangeIndex(input: number, inputRange: number[]): number {
  let i;
  for (i = 1; i < inputRange.length - 1; ++i) {
    if (inputRange[i] >= input) break;
  }
  return i - 1;
}

// Multi-segment numeric interpolation built on RN's single-segment primitive.
function interpolateNumeric(
  value: number,
  inputRange: number[],
  outputRange: number[],
  extrapolate: Extrapolate,
  extrapolateLeft: Extrapolate | undefined,
  extrapolateRight: Extrapolate | undefined,
  easing: (t: number) => number,
): number {
  const i = findRangeIndex(value, inputRange);
  return interpolateSegment(
    value,
    inputRange[i],
    inputRange[i + 1],
    outputRange[i],
    outputRange[i + 1],
    easing,
    extrapolateLeft ?? extrapolate,
    extrapolateRight ?? extrapolate,
  );
}

// Named colors used by RN's tests (RGBA components, alpha 0..1).
const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
  yellow: [255, 255, 0, 1],
  cyan: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
  orange: [255, 165, 0, 1],
  purple: [128, 0, 128, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
};

// Parse a color string to RGBA components ([r,g,b, a:0..1]) or null if not a
// recognized color (so it falls through to the numeric-suffix string path).
// Mirrors the subset of normalizeColor that RN's interpolation tests exercise.
function colorToRgba(input: string): [number, number, number, number] | null {
  const s = input.toLowerCase().trim();
  if (NAMED_COLORS[s]) return [...NAMED_COLORS[s]];
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) {
    const [r, g, b] = m[1].split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), 1];
  }
  if ((m = s.match(/^#([0-9a-f]{6})$/))) {
    const n = m[1];
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
      1,
    ];
  }
  if ((m = s.match(/^#([0-9a-f]{8})$/))) {
    const n = m[1];
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
      parseInt(n.slice(6, 8), 16) / 255,
    ];
  }
  // Strip whitespace once (linear) so the rgb()/rgba() patterns need no \s*
  // groups; overlapping \s* caused polynomial backtracking (ReDoS) on malformed
  // input like "rgb(9,9,9" followed by many spaces.
  const compact = s.replace(/\s+/g, "");
  if ((m = compact.match(/^rgb\(([\d.]+),([\d.]+),([\d.]+)\)$/))) {
    return [+m[1], +m[2], +m[3], 1];
  }
  if ((m = compact.match(/^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/))) {
    return [+m[1], +m[2], +m[3], +m[4]];
  }
  return null;
}

// Matches RN's numericComponentRegex (signed decimals incl. exponent notation).
const NUMERIC_COMPONENT_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

interface MappedComponents {
  isColor: boolean;
  components: Array<number | string>;
}

// Splits a string output value into a color (4 RGBA numbers) or an ordered list
// of numeric + literal-string parts (mirrors RN's mapStringToNumericComponents).
function mapStringToComponents(input: string): MappedComponents {
  const rgba = colorToRgba(input);
  if (rgba) return { isColor: true, components: rgba };

  const components: Array<number | string> = [];
  let lastMatchEnd = 0;
  let match: RegExpExecArray | null;
  NUMERIC_COMPONENT_RE.lastIndex = 0;
  while ((match = NUMERIC_COMPONENT_RE.exec(input)) != null) {
    if (match.index > lastMatchEnd) components.push(input.substring(lastMatchEnd, match.index));
    components.push(parseFloat(match[0]));
    lastMatchEnd = match.index + match[0].length;
  }
  if (components.length === 0) {
    throw new Error("outputRange must contain color or value with numeric component");
  }
  if (lastMatchEnd < input.length) components.push(input.substring(lastMatchEnd, input.length));
  return { isColor: false, components };
}

interface PreparedStringInterp {
  isColor: boolean;
  template: Array<number | string>;
  perSlotRanges: number[][];
}

// Validate + pre-parse a string output range (eager, like RN's createStringInterpolation),
// throwing the same invariants on inconsistent patterns.
function prepareStringInterpolation(outputRange: string[]): PreparedStringInterp {
  const mapped = outputRange.map(mapStringToComponents);
  const isColor = mapped[0].isColor;
  if (!mapped.every((o) => o.isColor === isColor)) {
    throw new Error(
      "All elements of output range should either be a color or a string with numeric components",
    );
  }
  const first = mapped[0].components;
  if (!mapped.every((o) => o.components.length === first.length)) {
    throw new Error("All elements of output range should have the same number of components");
  }
  if (!mapped.every((o) => o.components.every((c, i) => typeof c === "number" || c === first[i]))) {
    throw new Error("All elements of output range should have the same non-numeric components");
  }

  const numericComponents = mapped.map((o) =>
    isColor
      ? (o.components as number[])
      : (o.components.filter((c) => typeof c === "number") as number[]),
  );
  const perSlotRanges = numericComponents[0].map((_, i) => numericComponents.map((c) => c[i]));
  return { isColor, template: first, perSlotRanges };
}

// Compute the string/color result at `value` from the prepared interpolation.
function interpolateString(
  prepared: PreparedStringInterp,
  value: number,
  inputRange: number[],
  extrapolate: Extrapolate,
  extrapolateLeft: Extrapolate | undefined,
  extrapolateRight: Extrapolate | undefined,
  easing: (t: number) => number,
): string {
  const slots = prepared.perSlotRanges.map((range) =>
    interpolateNumeric(
      value,
      inputRange,
      range,
      extrapolate,
      extrapolateLeft,
      extrapolateRight,
      easing,
    ),
  );
  if (prepared.isColor) {
    // rgb channels are integers; alpha is rounded to the nearest thousandth.
    const r = slots.map((v, i) => (i < 3 ? Math.round(v) : Math.round(v * 1000) / 1000));
    return `rgba(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]})`;
  }
  let i = 0;
  return prepared.template.map((c) => (typeof c === "number" ? slots[i++] : c)).join("");
}

// Validate numeric input/output ranges (mirrors RN's checkValidRanges).
function checkValidRanges(inputRange: number[], outputRange: unknown[]): void {
  if (inputRange.length === 2 && inputRange[0] === -Infinity && inputRange[1] === Infinity) {
    throw new Error("inputRange cannot be [-Infinity, Infinity]");
  }
  if (inputRange.length < 2) throw new Error("inputRange must have at least 2 elements");
  for (let i = 1; i < inputRange.length; ++i) {
    if (!(inputRange[i] >= inputRange[i - 1])) {
      throw new Error("inputRange must be monotonically non-decreasing " + String(inputRange));
    }
  }
  if (inputRange.length !== outputRange.length) {
    throw new Error(
      "inputRange (" +
        inputRange.length +
        ") and outputRange (" +
        outputRange.length +
        ") must have the same length",
    );
  }
}

class AnimatedValue {
  private _value: number;
  private _listeners: Map<string, Function> = new Map();
  private _listenerIdCounter = 0;
  _tracking: { source: AnimatedValue; listenerId: string } | null = null;

  constructor(value: number = 0) {
    this._value = value;
  }

  setValue(value: number) {
    this._value = value;
    this._listeners.forEach((fn) => fn({ value }));
  }

  getValue() {
    return this._value;
  }

  addListener(callback: Function): string {
    const id = String(++this._listenerIdCounter);
    this._listeners.set(id, callback);
    return id;
  }

  removeListener(id: string) {
    this._listeners.delete(id);
  }

  removeAllListeners() {
    this._listeners.clear();
  }

  interpolate(config: any) {
    const {
      inputRange,
      outputRange,
      extrapolate = "extend",
      extrapolateLeft,
      extrapolateRight,
      easing = IDENTITY_EASING,
    } = config || {};
    if (!inputRange || !outputRange || inputRange.length < 2 || outputRange.length < 2) {
      return new AnimatedValue(this._value);
    }
    // Validate ranges eagerly, like RN's createInterpolation (monotonic input,
    // matched lengths, no [-Infinity, Infinity]).
    checkValidRanges(inputRange, outputRange);

    // String output ranges ("0deg" -> "360deg", rgba(...), arbitrary suffixes).
    // Parse + validate the pattern eagerly, then return a live interpolation node
    // whose getValue()/__getValue() reconstruct the string from the current source
    // value, mirroring RN's AnimatedInterpolation surface.
    if (typeof outputRange[0] === "string") {
      const prepared = prepareStringInterpolation(outputRange);
      // Arrow closes over `this`, so getValue() reads the live source value.
      const compute = () =>
        interpolateString(
          prepared,
          this._value,
          inputRange,
          extrapolate,
          extrapolateLeft,
          extrapolateRight,
          easing,
        );
      return {
        getValue: compute,
        __getValue: compute,
        toJSON: compute,
        // Chaining off a string/color interpolation is invalid in RN (the parent
        // value is no longer numeric). Match that by throwing.
        interpolate: () => {
          throw new Error("Cannot chain an interpolation off a string-valued interpolation");
        },
        addListener: () => "0",
        removeListener: () => {},
        removeAllListeners: () => {},
        stopAnimation: (cb?: Function) => cb?.(compute()),
        resetAnimation: (cb?: Function) => cb?.(compute()),
      } as any;
    }
    const result = interpolateNumeric(
      this._value,
      inputRange,
      outputRange,
      extrapolate,
      extrapolateLeft,
      extrapolateRight,
      easing,
    );
    return new AnimatedValue(result);
  }

  stopAnimation(callback?: Function) {
    callback?.(this._value);
  }

  resetAnimation(callback?: Function) {
    callback?.(this._value);
  }

  toJSON() {
    return this._value;
  }

  setOffset(_offset: number) {}
  flattenOffset() {}
  extractOffset() {}
}

class AnimatedValueXY {
  x: AnimatedValue;
  y: AnimatedValue;

  constructor(value?: { x: number; y: number }) {
    this.x = new AnimatedValue(value?.x ?? 0);
    this.y = new AnimatedValue(value?.y ?? 0);
  }

  setValue(value: { x: number; y: number }) {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }

  setOffset(_offset: { x: number; y: number }) {}
  flattenOffset() {}
  extractOffset() {}

  stopAnimation(callback?: Function) {
    callback?.({ x: this.x.getValue(), y: this.y.getValue() });
  }

  resetAnimation(callback?: Function) {
    callback?.({ x: this.x.getValue(), y: this.y.getValue() });
  }

  addListener(_callback: Function) {
    const xId = this.x.addListener(() => {});
    const yId = this.y.addListener(() => {});
    return { x: xId, y: yId };
  }

  removeListener(id: { x: string; y: string }) {
    this.x.removeListener(id.x);
    this.y.removeListener(id.y);
  }

  getLayout() {
    return { left: this.x, top: this.y };
  }

  getTranslateTransform() {
    return [{ translateX: this.x }, { translateY: this.y }];
  }
}

const namedColorMap: Record<string, [number, number, number, number]> = {
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
  yellow: [255, 255, 0, 1],
  cyan: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
};

function parseColorString(color: string): [number, number, number, number] {
  // Strip whitespace once (linear) so the rgb()/rgba() pattern needs no \s*
  // groups; overlapping \s* caused polynomial backtracking (ReDoS) on malformed
  // input like "rgb(9,9,9" followed by many spaces.
  const compact = color.replace(/\s+/g, "");
  const rgba = compact.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/);
  if (rgba)
    return [
      parseInt(rgba[1]),
      parseInt(rgba[2]),
      parseInt(rgba[3]),
      rgba[4] != null ? parseFloat(rgba[4]) : 1,
    ];
  const hex8 = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex8)
    return [
      parseInt(hex8[1], 16),
      parseInt(hex8[2], 16),
      parseInt(hex8[3], 16),
      parseInt(hex8[4], 16) / 255,
    ];
  const hex6 = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex6) return [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16), 1];
  const named = namedColorMap[color.toLowerCase()];
  if (named) return named;
  return [0, 0, 0, 1];
}

class AnimatedColor {
  r: AnimatedValue;
  g: AnimatedValue;
  b: AnimatedValue;
  a: AnimatedValue;
  private _listeners: Map<string, Function> = new Map();
  private _listenerIdCounter = 0;

  constructor(color?: any) {
    if (typeof color === "string") {
      const [r, g, b, a] = parseColorString(color);
      this.r = new AnimatedValue(r);
      this.g = new AnimatedValue(g);
      this.b = new AnimatedValue(b);
      this.a = new AnimatedValue(a);
    } else if (color && typeof color === "object") {
      const isAnimated = color.r instanceof AnimatedValue;
      if (isAnimated) {
        this.r = color.r;
        this.g = color.g;
        this.b = color.b;
        this.a = color.a;
      } else if (typeof color.r === "number") {
        this.r = new AnimatedValue(color.r);
        this.g = new AnimatedValue(color.g ?? 0);
        this.b = new AnimatedValue(color.b ?? 0);
        this.a = new AnimatedValue(color.a ?? 1);
      } else {
        this.r = new AnimatedValue(0);
        this.g = new AnimatedValue(0);
        this.b = new AnimatedValue(0);
        this.a = new AnimatedValue(1);
      }
    } else {
      this.r = new AnimatedValue(0);
      this.g = new AnimatedValue(0);
      this.b = new AnimatedValue(0);
      this.a = new AnimatedValue(1);
    }
  }

  setValue(value: any) {
    if (typeof value === "string") {
      const [r, g, b, a] = parseColorString(value);
      this.r.setValue(r);
      this.g.setValue(g);
      this.b.setValue(b);
      this.a.setValue(a);
    } else if (value && typeof value === "object" && typeof value.r === "number") {
      this.r.setValue(value.r);
      this.g.setValue(value.g ?? 0);
      this.b.setValue(value.b ?? 0);
      this.a.setValue(value.a ?? 1);
    }
    const colorStr = this.__getValue();
    this._listeners.forEach((fn) => fn({ value: colorStr }));
  }

  __getValue(): string {
    const r = Math.round(this.r.getValue());
    const g = Math.round(this.g.getValue());
    const b = Math.round(this.b.getValue());
    const a = this.a.getValue();
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  addListener(callback: Function): string {
    const id = String(++this._listenerIdCounter);
    this._listeners.set(id, callback);
    return id;
  }

  removeListener(id: string) {
    this._listeners.delete(id);
  }

  removeAllListeners() {
    this._listeners.clear();
  }

  setOffset(_offset: any) {}
  flattenOffset() {}
  stopAnimation(callback?: Function) {
    callback?.(this.__getValue());
  }
  resetAnimation(callback?: Function) {
    callback?.(this.__getValue());
  }
}

function createAnimation(onStart?: () => void) {
  return {
    start: vi.fn((callback?: Function) => {
      onStart?.();
      callback?.({ finished: true });
    }),
    stop: vi.fn((callback?: Function) => {
      callback?.({ finished: false });
    }),
    reset: vi.fn(),
  };
}

function createAnimatedWrapper(displayName: string) {
  const Component = React.forwardRef((props: any, ref: any) => {
    return React.createElement(displayName, { ...props, ref });
  });
  Component.displayName = displayName;
  return Component;
}

function stopTracking(value: AnimatedValue) {
  if (value._tracking) {
    value._tracking.source.removeListener(value._tracking.listenerId);
    value._tracking = null;
  }
}

function startTracking(value: AnimatedValue, toValue: any) {
  // Always stop previous tracking
  stopTracking(value);

  if (toValue instanceof AnimatedValue) {
    // Track the source value
    value.setValue(toValue.getValue());
    const listenerId = toValue.addListener(({ value: v }: { value: number }) => {
      value.setValue(v);
    });
    value._tracking = { source: toValue, listenerId };
  } else {
    value.setValue(toValue);
  }
}

export function createAnimatedMock() {
  return {
    Value: AnimatedValue,
    ValueXY: AnimatedValueXY,
    Color: AnimatedColor,
    timing: vi.fn((value: any, config: any) => {
      return createAnimation(() => {
        if (value instanceof AnimatedValue && config?.toValue != null) {
          startTracking(value, config.toValue);
        }
      });
    }),
    spring: vi.fn((value: any, config: any) => {
      return createAnimation(() => {
        if (value instanceof AnimatedValue && config?.toValue != null) {
          startTracking(value, config.toValue);
        }
      });
    }),
    decay: vi.fn((_value: any, _config: any) => createAnimation()),
    sequence: vi.fn((animations: any[]) => {
      let current = 0;
      let cb: Function | undefined;
      return {
        start: vi.fn((endCallback?: Function) => {
          cb = endCallback;
          if (animations.length === 0) {
            cb?.({ finished: true });
            return;
          }
          // If restarting after finish, reset to beginning
          if (current >= animations.length) {
            current = 0;
          }
          const runNext = (result: { finished: boolean }) => {
            if (!result.finished) {
              cb?.({ finished: false });
              return;
            }
            current++;
            if (current >= animations.length) {
              cb?.({ finished: true });
              return;
            }
            animations[current]?.start(runNext);
          };
          animations[current]?.start(runNext);
        }),
        stop: vi.fn(() => {
          if (current < animations.length) {
            animations[current]?.stop?.();
          }
        }),
        reset: vi.fn(() => {
          current = 0;
          for (const anim of animations) {
            anim?.reset?.();
          }
        }),
      };
    }),
    parallel: vi.fn((animations: any[]) => {
      let doneCount = 0;
      let hasBeenStopped = false;
      let cb: Function | undefined;
      const validAnims = animations.filter(Boolean);
      return {
        start: vi.fn((endCallback?: Function) => {
          cb = endCallback;
          doneCount = 0;
          hasBeenStopped = false;
          if (validAnims.length === 0) {
            cb?.({ finished: true });
            return;
          }
          validAnims.forEach((anim) => {
            anim.start((result: { finished: boolean }) => {
              doneCount++;
              if (!result.finished && !hasBeenStopped) {
                hasBeenStopped = true;
                // Stop all other animations that haven't finished
                validAnims.forEach((other) => {
                  if (other !== anim) {
                    other.stop?.();
                  }
                });
              }
              if (doneCount >= validAnims.length) {
                cb?.(result);
              }
            });
          });
        }),
        stop: vi.fn(() => {
          hasBeenStopped = true;
          validAnims.forEach((anim) => {
            anim.stop?.();
          });
        }),
        reset: vi.fn(() => {
          for (const anim of validAnims) {
            anim?.reset?.();
          }
        }),
      };
    }),
    stagger: vi.fn((_time: number, animations: any[]) => {
      // In the mock, stagger behaves like parallel — all start immediately (synchronous)
      const validAnims = animations.filter(Boolean);
      let doneCount = 0;
      let hasBeenStopped = false;
      return {
        start: vi.fn((endCallback?: Function) => {
          doneCount = 0;
          hasBeenStopped = false;
          if (validAnims.length === 0) {
            endCallback?.({ finished: true });
            return;
          }
          validAnims.forEach((anim) => {
            anim.start?.((result: { finished: boolean }) => {
              doneCount++;
              if (!result.finished && !hasBeenStopped) {
                hasBeenStopped = true;
                validAnims.forEach((other) => {
                  if (other !== anim) other.stop?.();
                });
              }
              if (doneCount >= validAnims.length) {
                endCallback?.(result);
              }
            });
          });
        }),
        stop: vi.fn(() => {
          hasBeenStopped = true;
          validAnims.forEach((anim) => anim.stop?.());
        }),
        reset: vi.fn(() => {
          validAnims.forEach((anim) => anim.reset?.());
        }),
      };
    }),
    loop: vi.fn((animation: any, config?: any) => {
      const iterations = config?.iterations;
      const resetBeforeIteration = config?.resetBeforeIteration !== false;
      let stopped = false;
      let startCallback: Function | undefined;
      return {
        start: vi.fn((endCallback?: Function) => {
          stopped = false;
          startCallback = endCallback;
          if (iterations === 0) {
            endCallback?.({ finished: true });
            return;
          }
          let iterationCount = 0;
          const onIteration = (result: { finished: boolean }) => {
            if (stopped || !result.finished) {
              startCallback?.(result);
              return;
            }
            iterationCount++;
            if (iterations != null && iterations > 0 && iterationCount >= iterations) {
              startCallback?.({ finished: true });
              return;
            }
            // Continue looping
            if (resetBeforeIteration) {
              animation.reset?.();
            }
            animation.start(onIteration);
          };
          if (resetBeforeIteration) {
            animation.reset?.();
          }
          animation.start(onIteration);
        }),
        stop: vi.fn(() => {
          stopped = true;
          animation.stop?.();
        }),
        reset: vi.fn(() => {
          animation.reset?.();
        }),
      };
    }),
    delay: vi.fn((_time: number) => {
      // Synchronous in mock — no real delay needed for testing
      return createAnimation();
    }),
    add: vi.fn((a: any, b: any) => {
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      const bVal = b instanceof AnimatedValue ? b.getValue() : typeof b === "number" ? b : 0;
      return new AnimatedValue(aVal + bVal);
    }),
    subtract: vi.fn((a: any, b: any) => {
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      const bVal = b instanceof AnimatedValue ? b.getValue() : typeof b === "number" ? b : 0;
      return new AnimatedValue(aVal - bVal);
    }),
    multiply: vi.fn((a: any, b: any) => {
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      const bVal = b instanceof AnimatedValue ? b.getValue() : typeof b === "number" ? b : 0;
      return new AnimatedValue(aVal * bVal);
    }),
    divide: vi.fn((a: any, b: any) => {
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      const bVal = b instanceof AnimatedValue ? b.getValue() : typeof b === "number" ? b : 0;
      return new AnimatedValue(bVal === 0 ? 0 : aVal / bVal);
    }),
    modulo: vi.fn((a: any, modulus: number) => {
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      return new AnimatedValue(((aVal % modulus) + modulus) % modulus);
    }),
    diffClamp: vi.fn((a: any, min: number, max: number) => {
      const result = new AnimatedValue(
        Math.min(Math.max(a instanceof AnimatedValue ? a.getValue() : 0, min), max),
      );
      if (a instanceof AnimatedValue) {
        let lastInput = a.getValue();
        let current = result.getValue();
        a.addListener(({ value }: { value: number }) => {
          const diff = value - lastInput;
          lastInput = value;
          current = Math.min(Math.max(current + diff, min), max);
          result.setValue(current);
        });
      }
      return result;
    }),
    event: vi.fn((argMapping: any[], config?: any) => {
      const handler = vi.fn((...args: any[]) => {
        // Walk the arg mapping and extract values from the event args
        argMapping.forEach((mapping, index) => {
          if (mapping && args[index]) {
            traverseMapping(mapping, args[index]);
          }
        });
        config?.listener?.(...args);
      });
      function traverseMapping(mapping: any, value: any) {
        if (mapping instanceof AnimatedValue && typeof value === "number") {
          mapping.setValue(value);
          return;
        }
        if (
          typeof mapping === "object" &&
          mapping !== null &&
          typeof value === "object" &&
          value !== null
        ) {
          for (const key of Object.keys(mapping)) {
            if (key in value) {
              traverseMapping(mapping[key], value[key]);
            }
          }
        }
      }
      return handler;
    }),
    forkEvent: vi.fn((handler: any, listener: Function) => {
      return (...args: any[]) => {
        if (typeof handler === "function") {
          handler(...args);
        } else if (handler && handler.__isNative) {
          // Native event handler — skip
        }
        listener(...args);
      };
    }),
    unforkEvent: vi.fn(),
    createAnimatedComponent: vi.fn((component: any) => {
      const Wrapper = React.forwardRef((props: any, ref: any) => {
        return React.createElement(component, { ...props, ref });
      });
      Wrapper.displayName = `Animated(${component.displayName || component.name || "Component"})`;
      return Wrapper;
    }),
    View: createAnimatedWrapper("Animated.View"),
    Text: createAnimatedWrapper("Animated.Text"),
    Image: createAnimatedWrapper("Animated.Image"),
    ScrollView: createAnimatedWrapper("Animated.ScrollView"),
    FlatList: createAnimatedWrapper("Animated.FlatList"),
    SectionList: createAnimatedWrapper("Animated.SectionList"),
  };
}
