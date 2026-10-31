// The module a test partially mocks: `read` stays real and reads the store.
import { store } from "./store";

export const read = (): string | null => store.value;
export const other = (): string => "real";
