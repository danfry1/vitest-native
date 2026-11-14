import { configure } from "@testing-library/react-native";
import { test } from "vitest";

test("changes RNTL's configuration and leaves it", () => {
  configure({ defaultIncludeHiddenElements: true });
});
