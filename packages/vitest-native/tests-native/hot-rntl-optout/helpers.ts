// A shared helper that opts its importers out, as a project's test-utils might.
import "@testing-library/react-native/dont-cleanup-after-each";
export { render, screen } from "@testing-library/react-native";
