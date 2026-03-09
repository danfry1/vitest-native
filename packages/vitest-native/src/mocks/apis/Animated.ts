import React from "react";
import { vi } from "vitest";

class AnimatedValue {
  private _value: number;
  private _listeners: Map<string, Function> = new Map();
  private _listenerIdCounter = 0;

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
    const { inputRange, outputRange } = config || {};
    if (!inputRange || !outputRange || inputRange.length < 2 || outputRange.length < 2) {
      return new AnimatedValue(this._value);
    }
    // Clamp to input range
    const val = Math.max(inputRange[0], Math.min(inputRange[inputRange.length - 1], this._value));
    // Find segment
    let i = 0;
    for (; i < inputRange.length - 2; i++) {
      if (val <= inputRange[i + 1]) break;
    }
    const inMin = inputRange[i];
    const inMax = inputRange[i + 1];
    const outMin =
      typeof outputRange[i] === "number" ? outputRange[i] : parseFloat(outputRange[i]) || 0;
    const outMax =
      typeof outputRange[i + 1] === "number"
        ? outputRange[i + 1]
        : parseFloat(outputRange[i + 1]) || 0;
    const t = inMax === inMin ? 0 : (val - inMin) / (inMax - inMin);
    return new AnimatedValue(outMin + t * (outMax - outMin));
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

class AnimatedColor {
  r: AnimatedValue;
  g: AnimatedValue;
  b: AnimatedValue;
  a: AnimatedValue;

  constructor() {
    this.r = new AnimatedValue(0);
    this.g = new AnimatedValue(0);
    this.b = new AnimatedValue(0);
    this.a = new AnimatedValue(1);
  }

  setValue(_value: any) {}
  setOffset(_offset: any) {}
  flattenOffset() {}
  stopAnimation(callback?: Function) {
    callback?.(0);
  }
  resetAnimation(callback?: Function) {
    callback?.(0);
  }
}

function createAnimation(onStart?: () => void) {
  let running = false;
  return {
    start: vi.fn((callback?: Function) => {
      running = true;
      onStart?.();
      running = false;
      callback?.({ finished: true });
    }),
    stop: vi.fn((callback?: Function) => {
      if (running) running = false;
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

export function createAnimatedMock() {
  return {
    Value: AnimatedValue,
    ValueXY: AnimatedValueXY,
    Color: AnimatedColor,
    timing: vi.fn((value: any, config: any) =>
      createAnimation(() => {
        if (value instanceof AnimatedValue && config?.toValue != null) {
          value.setValue(config.toValue);
        }
      }),
    ),
    spring: vi.fn((value: any, config: any) =>
      createAnimation(() => {
        if (value instanceof AnimatedValue && config?.toValue != null) {
          value.setValue(config.toValue);
        }
      }),
    ),
    decay: vi.fn((_value: any, _config: any) => createAnimation()),
    sequence: vi.fn((animations: any[]) =>
      createAnimation(() => {
        for (const anim of animations) {
          anim?.start?.();
        }
      }),
    ),
    parallel: vi.fn((animations: any[]) =>
      createAnimation(() => {
        for (const anim of animations) {
          anim?.start?.();
        }
      }),
    ),
    stagger: vi.fn((_time: number, animations: any[]) =>
      createAnimation(() => {
        for (const anim of animations) {
          anim?.start?.();
        }
      }),
    ),
    loop: vi.fn((_animation: any, _config?: any) => createAnimation()),
    delay: vi.fn((_time: number) => createAnimation()),
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
      const aVal = a instanceof AnimatedValue ? a.getValue() : typeof a === "number" ? a : 0;
      return new AnimatedValue(Math.min(Math.max(aVal, min), max));
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
        if (typeof mapping === "object" && mapping !== null && typeof value === "object" && value !== null) {
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
