/**
 * Reanimated's layout animations, Keyframe, animated refs and worklet runtimes as an app
 * uses them, under the native engine (#696): Reanimated's own builder classes (its mock
 * gives one shared object per builder), a function ref with `current`, and runtimes whose
 * worklets run. The conformance gate (conformance/reanimated.test.tsx) checks their shape;
 * this checks they behave.
 */
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import Animated, {
  ComplexAnimationBuilder,
  createWorkletRuntime,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  measure,
  runOnRuntime,
  useAnimatedRef,
} from "react-native-reanimated";
import { describe, expect, it } from "vitest";

describe("layout animation builders", () => {
  it("are classes: new, instanceof, and the static chain", () => {
    const built = new FadeIn().duration(300).delay(100);
    expect(built).toBeInstanceOf(FadeIn);
    expect(FadeIn.duration(300)).toBeInstanceOf(FadeIn);
    expect(typeof built.build()).toBe("function");
  });

  it("can be extended, as a custom animation is", () => {
    class Grow extends ComplexAnimationBuilder {
      static presetName = "Grow";
      static createInstance<T extends typeof ComplexAnimationBuilder>(this: T) {
        return new Grow() as InstanceType<T>;
      }
      build = () => () => ({ initialValues: {}, animations: {} });
    }
    expect(Grow.duration(200)).toBeInstanceOf(Grow);
    expect(new Grow().springify()).toBeInstanceOf(ComplexAnimationBuilder);
  });

  it("render as entering, exiting and layout, Keyframe included", async () => {
    const keyframe = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1 } }).duration(200);
    expect(keyframe).toBeInstanceOf(Keyframe);
    await render(
      <Animated.View
        entering={new FadeIn().duration(300)}
        exiting={FadeOut}
        layout={LinearTransition.springify()}
      >
        <Animated.Text entering={keyframe}>row</Animated.Text>
      </Animated.View>,
    );
    expect(screen.getByText("row")).toBeTruthy();
  });
});

it("useAnimatedRef is a function ref that holds the mounted view", async () => {
  let ref: any;
  function List() {
    ref = useAnimatedRef();
    return (
      <Animated.ScrollView ref={ref}>
        <Text>row</Text>
      </Animated.ScrollView>
    );
  }
  await render(<List />);
  expect(typeof ref).toBe("function");
  expect(ref.current).not.toBeNull();
  expect(typeof ref.observe(() => {})).toBe("function");
  expect(measure(ref)).toBeTruthy();
});

it("runOnRuntime runs its worklet on a created runtime", () => {
  const runtime = createWorkletRuntime({ name: "background" });
  expect(runtime.name).toBe("background");
  expect(typeof runtime.runtimeId).toBe("number");
  const seen: number[] = [];
  runOnRuntime(runtime, (n: number) => {
    seen.push(n);
  })(7);
  expect(seen).toEqual([7]);
});
