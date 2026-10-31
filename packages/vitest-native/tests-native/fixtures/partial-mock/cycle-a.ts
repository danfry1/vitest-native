// Imports a module that imports this one back, as app code often does.
import { describeB } from "./cycle-b";

export const name = (): string => "a";
export const describeA = (): string => `a+${describeB()}`;
