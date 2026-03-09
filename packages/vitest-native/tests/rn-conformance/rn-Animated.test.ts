import { describe, it, expect, vi } from "vitest";
import { Animated } from "react-native";

describe('Animated', () => {
  it('triggers callback when spring is at rest', () => {
    const anim = new Animated.Value(0);
    const callback = vi.fn();
    Animated.spring(anim, {
      toValue: 0,
      velocity: 0,
      useNativeDriver: false,
    }).start(callback);
    expect(callback).toBeCalled();
  });

  it('convert to JSON', () => {
    expect(JSON.stringify(new Animated.Value(10))).toBe('10');
  });
});

describe('Animated Listeners', () => {
  it('should get updates', () => {
    const value1 = new Animated.Value(0);
    const listener = vi.fn();
    const id = value1.addListener(listener);
    value1.setValue(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({value: 42});
    expect(value1.getValue()).toBe(42);
    value1.setValue(7);
    expect(listener.mock.calls.length).toBe(2);
    expect(listener).toBeCalledWith({value: 7});
    expect(value1.getValue()).toBe(7);
    value1.removeListener(id);
    value1.setValue(1492);
    expect(listener.mock.calls.length).toBe(2);
    expect(value1.getValue()).toBe(1492);
  });

  it('should removeAll', () => {
    const value1 = new Animated.Value(0);
    const listener = vi.fn();
    [1, 2, 3, 4].forEach(() => value1.addListener(listener));
    value1.setValue(42);
    expect(listener.mock.calls.length).toBe(4);
    expect(listener).toBeCalledWith({value: 42});
    value1.removeAllListeners();
    value1.setValue(7);
    expect(listener.mock.calls.length).toBe(4);
  });
});

describe('Animated Events', () => {
  it('should map events', () => {
    const value = new Animated.Value(0);
    const handler = Animated.event([null, {state: {foo: value}}], {
      useNativeDriver: false,
    });
    handler({bar: 'ignoreBar'}, {state: {baz: 'ignoreBaz', foo: 42}});
    expect(value.getValue()).toBe(42);
  });

  it('should validate AnimatedValueXY mappings', () => {
    const value = new Animated.ValueXY({x: 0, y: 0});
    const handler = Animated.event([{state: value}], {
      useNativeDriver: false,
    });
    handler({state: {x: 1, y: 2}});
    expect(value.x.getValue()).toBe(1);
    expect(value.y.getValue()).toBe(2);
  });

  it('should call listeners', () => {
    const value = new Animated.Value(0);
    const listener = vi.fn();
    const handler = Animated.event([{foo: value}], {
      listener,
      useNativeDriver: false,
    });
    handler({foo: 42});
    expect(value.getValue()).toBe(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({foo: 42});
  });

  it('should call forked event listeners, with Animated.event() listener', () => {
    const value = new Animated.Value(0);
    const listener = vi.fn();
    const handler = Animated.event([{foo: value}], {
      listener,
      useNativeDriver: false,
    });
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(handler, listener2);
    forkedHandler({foo: 42});
    expect(value.getValue()).toBe(42);
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({foo: 42});
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({foo: 42});
  });

  it('should call forked event listeners, with js listener', () => {
    const listener = vi.fn();
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(listener, listener2);
    forkedHandler({foo: 42});
    expect(listener.mock.calls.length).toBe(1);
    expect(listener).toBeCalledWith({foo: 42});
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({foo: 42});
  });

  it('should call forked event listeners, with undefined listener', () => {
    const listener = undefined;
    const listener2 = vi.fn();
    const forkedHandler = Animated.forkEvent(listener, listener2);
    forkedHandler({foo: 42});
    expect(listener2.mock.calls.length).toBe(1);
    expect(listener2).toBeCalledWith({foo: 42});
  });
});
