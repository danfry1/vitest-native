// A React Native workspace library that the app's config aliases to this source
// directory with a string alias. It reads a store from a second workspace library.
import { store } from "@axis/validator/store";

export const readStore = (): string | null => store.value;
