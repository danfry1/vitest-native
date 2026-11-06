// A React Native workspace library: it peers on react-native, so the engine detects it
// and Node loads it. It reads a store and a class from a second workspace package that
// does not use React Native, which Vite loads.
import { Platform } from "react-native";
import { Box, store } from "@m/validator/store";

// Counted on `process`, which the hot runtime keeps from file to file, so a test can
// see how many times this module was evaluated in the worker.
const counts = process as unknown as { __vnFeatureEvaluations?: number };
counts.__vnFeatureEvaluations = (counts.__vnFeatureEvaluations ?? 0) + 1;

export const readStore = (): string | null => store.value;
export const makeBox = (n: number) => new Box(n);
export const BoxClass = Box;
export const platform = Platform;
