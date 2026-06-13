import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { Pressable, Text, TextInput, View } from "react-native";

// The native engine's setup must register the RNTL/jest-native matchers (the mock
// engine already does). Without it, engine:'native' users — and jest-compat
// migrations whose extend-expect is no-op'd — have no toBeOnTheScreen/toBeDisabled/
// toHaveStyle/etc. (regression for the gap the differential cross-check surfaced).
describe("native engine: RNTL/jest-native matchers are registered", () => {
  it("toBeOnTheScreen / toBeDisabled / toHaveTextContent / toHaveDisplayValue work", () => {
    render(
      <View>
        <Pressable testID="btn" disabled>
          <Text testID="label">label</Text>
        </Pressable>
        <TextInput testID="in" value="typed" onChangeText={() => {}} />
      </View>,
    );
    expect(screen.getByTestId("btn")).toBeOnTheScreen();
    expect(screen.getByTestId("btn")).toBeDisabled();
    expect(screen.getByTestId("label")).toHaveTextContent("label");
    expect(screen.getByTestId("in")).toHaveDisplayValue("typed");
  });

  it("registers the package animated matchers under the native engine", () => {
    render(<View testID="animated" style={{ opacity: 0.5 }} />);
    expect(screen.getByTestId("animated")).toHaveAnimatedStyle({ opacity: 0.5 });
    expect(screen.getByTestId("animated")).toHaveAnimatedProps({ testID: "animated" });
  });
});
