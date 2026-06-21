// Regression: the navigation preset's `defaultRouteParams` option. `useRoute()` mocks
// returned empty params with no way to configure them, so components that read
// `useRoute().params.<x>` at mount couldn't be tested without a custom vi.mock
// (trial report Issue 4). The option must also survive the main-process → worker
// boundary (presets are rebuilt in-worker from their name + serializable `config`).
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { useRoute } from "@react-navigation/native";
import { describe, expect, it } from "vitest";

function RouteParamsProbe() {
  const route = useRoute() as { params?: { id?: string; mode?: string } };
  return <Text>{`id=${route.params?.id} mode=${route.params?.mode}`}</Text>;
}

describe("navigation preset defaultRouteParams", () => {
  it("returns the configured params from useRoute() (across the worker boundary)", () => {
    render(<RouteParamsProbe />);
    expect(screen.getByText("id=42 mode=edit")).toBeTruthy();
  });
});
