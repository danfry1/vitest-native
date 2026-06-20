// The setInsets() helper drives the safe-area preset's mock insets under the native
// engine. third-party-stack.test.tsx renders default insets; this verifies the
// control helper actually flows through to useSafeAreaInsets() at render time.
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { afterEach, describe, expect, it } from "vitest";
import { resetAllMocks, setInsets } from "vitest-native/helpers";

function Insets() {
  const insets = useSafeAreaInsets();
  return <Text>{`top:${insets.top} bottom:${insets.bottom}`}</Text>;
}

afterEach(() => {
  resetAllMocks();
});

describe("native engine: setInsets drives the safe-area preset", () => {
  it("returns the configured insets from useSafeAreaInsets()", () => {
    setInsets({ top: 99, bottom: 7 });
    render(
      <SafeAreaProvider>
        <Insets />
      </SafeAreaProvider>,
    );
    expect(screen.getByText("top:99 bottom:7")).toBeTruthy();
  });
});
