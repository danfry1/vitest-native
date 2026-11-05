// A React Native workspace library (it peers on react-native, so the engine detects it and
// Node owns it) built on a store and a class from a second, non-React-Native workspace
// library, which Vite owns.
import { store, Box } from "@m/validator/store";

export const readStore = (): string | null => store.value;
export const makeBox = (n: number) => new Box(n);
