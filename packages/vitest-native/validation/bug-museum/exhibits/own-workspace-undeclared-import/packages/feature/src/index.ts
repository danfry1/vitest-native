// A React Native workspace package: Node loads its source, and this import of the
// library with it.
import { label, store } from "@m/lib";
export const readStore = () => store.value;
export const readLabel = () => label();
