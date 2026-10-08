// Loaded only through Node: its relative requires must resolve as Metro resolves them.
import { which } from "./platform-info";
import { pick } from "./pick";

export const resolved = (): string[] => [which(), pick()];
