import { describe, it, expect, vi } from "vitest";
import { Animated } from "react-native";

describe("Animated", () => {
  it("triggers callback when spring is at rest", () => {
    const anim = new Animated.Value(0);
    const callback = vi.fn();
    Animated.spring(anim, {
      toValue: 0,
      velocity: 0,
      useNativeDriver: false,
    }).start(callback);
    expect(callback).toBeCalled();
  });

  it("convert to JSON", () => {
    expect(JSON.stringify(new Animated.Value(10))).toBe("10");
  });
});

describe("Animated Listeners", () => {
  it("should get updates", () => {
    const value1 = new Animated.Value(0);
    const listener = vi.fn();
    const id = value1.addListener(listener);
    value1.setValue(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({ value: 42 });
    expect(value1.getValue()).toBe(42);
    value1.setValue(7);
    expect(listener.mock.calls.length).toBe(2);
    expect(listener).toBeCalledWith({ value: 7 });
    expect(value1.getValue()).toBe(7);
    value1.removeListener(id);
    value1.setValue(1492);
    expect(listener.mock.calls.length).toBe(2);
    expect(value1.getValue()).toBe(1492);
  });

  it("should removeAll", () => {
    const value1 = new Animated.Value(0);
    const listener = vi.fn();
    [1, 2, 3, 4].forEach(() => value1.addListener(listener));
    value1.setValue(42);
    expect(listener.mock.calls.length).toBe(4);
    expect(listener).toBeCalledWith({ value: 42 });
    value1.removeAllListeners();
    value1.setValue(7);
    expect(listener.mock.calls.length).toBe(4);
  });
});

describe("Animated Events", () => {
  it("should map events", () => {
    const value = new Animated.Value(0);
    const handler = Animated.event([null, { state: { foo: value } }], {
      useNativeDriver: false,
    });
    handler({ bar: "ignoreBar" }, { state: { baz: "ignoreBaz", foo: 42 } });
    expect(value.getValue()).toBe(42);
  });

  it("should validate AnimatedValueXY mappings", () => {
    const value = new Animated.ValueXY({ x: 0, y: 0 });
    const handler = Animated.event([{ state: value }], {
      useNativeDriver: false,
    });
    handler({ state: { x: 1, y: 2 } });
    expect(value.x.getValue()).toBe(1);
    expect(value.y.getValue()).toBe(2);
  });

  it("should call listeners", () => {
    const value = new Animated.Value(0);
    const listener = vi.fn();
    const handler = Animated.event([{ foo: value }], {
      listener,
      useNativeDriver: false,
    });
    handler({ foo: 42 });
    expect(value.getValue()).toBe(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({ foo: 42 });
  });

  it("should call forked event listeners, with Animated.event() listener", () => {
    const value = new Animated.Value(0);
    const listener = vi.fn();
    const handler = Animated.event([{ foo: value }], {
      listener,
      useNativeDriver: false,
    });
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(handler, listener2);
    forkedHandler({ foo: 42 });
    expect(value.getValue()).toBe(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({ foo: 42 });
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({ foo: 42 });
  });

  it("should call forked event listeners, with js listener", () => {
    const listener = vi.fn();
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(listener, listener2);
    forkedHandler({ foo: 42 });
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({ foo: 42 });
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({ foo: 42 });
  });

  it("should call forked event listeners, with undefined listener", () => {
    const listener = undefined;
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(listener, listener2);
    forkedHandler({ foo: 42 });
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({ foo: 42 });
  });
});

describe("Animated Diff Clamp", () => {
  it("should get the proper value", () => {
    const inputValues = [0, 20, 40, 30, 0, -40, -10, -20, 0];
    const expectedValues = [0, 20, 20, 10, 0, 0, 20, 10, 20];
    const value = new Animated.Value(0);
    const diffClampValue = Animated.diffClamp(value, 0, 20);
    for (let i = 0; i < inputValues.length; i++) {
      value.setValue(inputValues[i]);
      expect(diffClampValue.getValue()).toBe(expectedValues[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Animated Sequence — ported from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animated Sequence", () => {
  it("works with an empty sequence", () => {
    const cb = vi.fn();
    Animated.sequence([]).start(cb);
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("sequences well", () => {
    const anim1 = { start: vi.fn() };
    const anim2 = { start: vi.fn() };
    const cb = vi.fn();

    const seq = Animated.sequence([anim1 as any, anim2 as any]);

    expect(anim1.start).not.toBeCalled();
    expect(anim2.start).not.toBeCalled();

    seq.start(cb);

    expect(anim1.start).toBeCalled();
    expect(anim2.start).not.toBeCalled();
    expect(cb).not.toBeCalled();

    anim1.start.mock.calls[0][0]({ finished: true });

    expect(anim2.start).toBeCalled();
    expect(cb).not.toBeCalled();

    anim2.start.mock.calls[0][0]({ finished: true });
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("supports interrupting sequence", () => {
    const anim1 = { start: vi.fn() };
    const anim2 = { start: vi.fn() };
    const cb = vi.fn();

    Animated.sequence([anim1 as any, anim2 as any]).start(cb);

    anim1.start.mock.calls[0][0]({ finished: false });

    expect(anim1.start).toBeCalled();
    expect(anim2.start).not.toBeCalled();
    expect(cb).toBeCalledWith({ finished: false });
  });

  it("supports stopping sequence", () => {
    const anim1 = { start: vi.fn(), stop: vi.fn() };
    const anim2 = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();

    const seq = Animated.sequence([anim1 as any, anim2 as any]);
    seq.start(cb);
    seq.stop();

    expect(anim1.stop).toBeCalled();
    expect(anim2.stop).not.toBeCalled();
    expect(cb).not.toBeCalled();

    anim1.start.mock.calls[0][0]({ finished: false });

    expect(cb).toBeCalledWith({ finished: false });
  });

  it("supports restarting sequence after stopped during execution", () => {
    const anim1 = { start: vi.fn(), stop: vi.fn() };
    const anim2 = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();

    const seq = Animated.sequence([anim1 as any, anim2 as any]);

    seq.start(cb);

    anim1.start.mock.calls[0][0]({ finished: true });
    seq.stop();

    expect(anim1.start).toHaveBeenCalledTimes(1);
    expect(anim2.start).toHaveBeenCalledTimes(1);

    seq.start(cb);

    // after restart the sequence should resume from the anim2
    expect(anim1.start).toHaveBeenCalledTimes(1);
    expect(anim2.start).toHaveBeenCalledTimes(2);
  });

  it("supports restarting sequence after finished", () => {
    const anim1 = { start: vi.fn(), stop: vi.fn() };
    const anim2 = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();

    const seq = Animated.sequence([anim1 as any, anim2 as any]);

    seq.start(cb);
    anim1.start.mock.calls[0][0]({ finished: true });
    anim2.start.mock.calls[0][0]({ finished: true });

    expect(cb).toBeCalledWith({ finished: true });

    seq.start(cb);

    // sequence should successfully restart from anim1
    expect(anim1.start).toHaveBeenCalledTimes(2);
    expect(anim2.start).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Animated Parallel — ported from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animated Parallel", () => {
  it("works with an empty parallel", () => {
    const cb = vi.fn();
    Animated.parallel([]).start(cb);
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("works with an empty element in array", () => {
    const anim1 = { start: vi.fn() };
    const cb = vi.fn();
    Animated.parallel([null as any, anim1 as any]).start(cb);

    expect(anim1.start).toBeCalled();
    anim1.start.mock.calls[0][0]({ finished: true });

    expect(cb).toBeCalledWith({ finished: true });
  });

  it("parallelizes well", () => {
    const anim1 = { start: vi.fn() };
    const anim2 = { start: vi.fn() };
    const cb = vi.fn();

    const par = Animated.parallel([anim1 as any, anim2 as any]);

    expect(anim1.start).not.toBeCalled();
    expect(anim2.start).not.toBeCalled();

    par.start(cb);

    expect(anim1.start).toBeCalled();
    expect(anim2.start).toBeCalled();
    expect(cb).not.toBeCalled();

    anim1.start.mock.calls[0][0]({ finished: true });
    expect(cb).not.toBeCalled();

    anim2.start.mock.calls[0][0]({ finished: true });
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("supports stopping parallel", () => {
    const anim1 = { start: vi.fn(), stop: vi.fn() };
    const anim2 = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();

    const par = Animated.parallel([anim1 as any, anim2 as any]);
    par.start(cb);
    par.stop();

    expect(anim1.stop).toBeCalled();
    expect(anim2.stop).toBeCalled();
    expect(cb).not.toBeCalled();

    anim1.start.mock.calls[0][0]({ finished: false });
    expect(cb).not.toBeCalled();

    anim2.start.mock.calls[0][0]({ finished: false });
    expect(cb).toBeCalledWith({ finished: false });
  });

  it("does not call stop more than once when stopping", () => {
    const anim1 = { start: vi.fn(), stop: vi.fn() };
    const anim2 = { start: vi.fn(), stop: vi.fn() };
    const anim3 = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();

    const par = Animated.parallel([anim1 as any, anim2 as any, anim3 as any]);
    par.start(cb);

    anim1.start.mock.calls[0][0]({ finished: false });

    expect(anim1.stop.mock.calls.length).toBe(0);
    expect(anim2.stop.mock.calls.length).toBe(1);
    expect(anim3.stop.mock.calls.length).toBe(1);

    anim2.start.mock.calls[0][0]({ finished: false });

    expect(anim1.stop.mock.calls.length).toBe(0);
    expect(anim2.stop.mock.calls.length).toBe(1);
    expect(anim3.stop.mock.calls.length).toBe(1);

    anim3.start.mock.calls[0][0]({ finished: false });

    expect(anim1.stop.mock.calls.length).toBe(0);
    expect(anim2.stop.mock.calls.length).toBe(1);
    expect(anim3.stop.mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Animated Loop — ported from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animated Loop", () => {
  it("loops indefinitely if config not specified", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any);

    expect(animation.start).not.toBeCalled();

    loop.start(cb);

    expect(animation.start).toBeCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 1
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 2
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 3
    expect(animation.reset).toHaveBeenCalledTimes(4);
    expect(cb).not.toBeCalled();
  });

  it("loops indefinitely if iterations is -1", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any, { iterations: -1 });

    loop.start(cb);

    expect(animation.start).toBeCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).not.toBeCalled();
  });

  it("loops three times if iterations is 3", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any, { iterations: 3 });

    loop.start(cb);

    expect(animation.start).toBeCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 1
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 2
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 3
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("does not loop if iterations is 1", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any, { iterations: 1 });

    loop.start(cb);

    expect(animation.start).toBeCalled();
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true });
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("does not animate if iterations is 0", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any, { iterations: 0 });

    loop.start(cb);

    expect(animation.start).not.toBeCalled();
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("supports interrupting an indefinite loop", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    Animated.loop(animation as any).start(cb);
    expect(animation.start).toBeCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 1
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: false }); // Interrupt
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).toBeCalledWith({ finished: false });
  });

  it("supports stopping loop", () => {
    const animation = {
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any);
    loop.start(cb);
    loop.stop();

    expect(animation.start).toBeCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(animation.stop).toBeCalled();

    animation.start.mock.calls[0][0]({ finished: false }); // Interrupt
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).toBeCalledWith({ finished: false });
  });

  it("does not reset if resetBeforeIteration is false", () => {
    const animation = {
      start: vi.fn(),
      reset: vi.fn(),
      _isUsingNativeDriver: () => false,
    };
    const cb = vi.fn();

    const loop = Animated.loop(animation as any, { resetBeforeIteration: false });

    loop.start(cb);

    expect(animation.start).toBeCalled();
    expect(animation.reset).not.toBeCalled();
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 1
    expect(animation.reset).not.toBeCalled();
    expect(cb).not.toBeCalled();

    animation.start.mock.calls[0][0]({ finished: true }); // End of loop 2
    expect(animation.reset).not.toBeCalled();
    expect(cb).not.toBeCalled();
  });
});

// ---------------------------------------------------------------------------
// Animated Delays — ported from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animated delays", () => {
  it("should call anim after delay in sequence", () => {
    const anim = { start: vi.fn(), stop: vi.fn() };
    const cb = vi.fn();
    Animated.sequence([Animated.delay(1000), anim as any]).start(cb);
    expect(anim.start.mock.calls.length).toBe(1);
    expect(cb).not.toBeCalled();
    anim.start.mock.calls[0][0]({ finished: true });
    expect(cb).toBeCalledWith({ finished: true });
  });

  it("should run stagger to end", () => {
    const cb = vi.fn();
    Animated.stagger(1000, [
      Animated.delay(1000),
      Animated.delay(1000),
      Animated.delay(1000),
    ]).start(cb);
    expect(cb).toBeCalledWith({ finished: true });
  });
});

// ---------------------------------------------------------------------------
// Animated Tracking — ported from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animated Tracking", () => {
  it("should track values", () => {
    const value1 = new Animated.Value(0);
    const value2 = new Animated.Value(0);
    Animated.timing(value2, {
      toValue: value1 as any,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(42);
    expect(value2.getValue()).toBe(42);
    value1.setValue(7);
    expect(value2.getValue()).toBe(7);
  });

  it("should stop tracking when animated", () => {
    const value1 = new Animated.Value(0);
    const value2 = new Animated.Value(0);
    Animated.timing(value2, {
      toValue: value1 as any,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(42);
    expect(value2.getValue()).toBe(42);
    Animated.timing(value2, {
      toValue: 7,
      duration: 0,
      useNativeDriver: false,
    }).start();
    value1.setValue(1492);
    expect(value2.getValue()).toBe(7);
  });

  it("should start tracking immediately on animation start", () => {
    const value1 = new Animated.Value(42);
    const value2 = new Animated.Value(0);
    Animated.timing(value2, {
      toValue: value1 as any,
      duration: 0,
      useNativeDriver: false,
    }).start();
    expect(value2.getValue()).toBe(42);
    value1.setValue(7);
    expect(value2.getValue()).toBe(7);
  });
});

describe("Animated Colors", () => {
  it("should normalize colors", () => {
    let color = new Animated.Color();
    expect(color.__getValue()).toEqual("rgba(0, 0, 0, 1)");

    color = new Animated.Color({ r: 11, g: 22, b: 33, a: 1.0 });
    expect(color.__getValue()).toEqual("rgba(11, 22, 33, 1)");

    color = new Animated.Color("rgba(255, 0, 0, 1.0)");
    expect(color.__getValue()).toEqual("rgba(255, 0, 0, 1)");

    color = new Animated.Color("#ff0000ff");
    expect(color.__getValue()).toEqual("rgba(255, 0, 0, 1)");

    color = new Animated.Color("red");
    expect(color.__getValue()).toEqual("rgba(255, 0, 0, 1)");

    color = new Animated.Color({
      r: new Animated.Value(255),
      g: new Animated.Value(0),
      b: new Animated.Value(0),
      a: new Animated.Value(1.0),
    });
    expect(color.__getValue()).toEqual("rgba(255, 0, 0, 1)");

    color = new Animated.Color("unknown");
    expect(color.__getValue()).toEqual("rgba(0, 0, 0, 1)");

    color = new Animated.Color({ key: "value" } as any);
    expect(color.__getValue()).toEqual("rgba(0, 0, 0, 1)");
  });
});
