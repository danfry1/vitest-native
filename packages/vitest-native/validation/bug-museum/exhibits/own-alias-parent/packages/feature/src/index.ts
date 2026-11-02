// A React Native workspace library (it peers on react-native, so the engine detects it)
// reading a store that lives in a second, non-React-Native workspace library.
import { store } from "@m/validator/src/store";

export const readStore = (): string | null => store.value;
