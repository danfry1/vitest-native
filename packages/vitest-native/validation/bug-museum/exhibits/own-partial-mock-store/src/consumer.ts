// App code that writes the store; the test never imports the store itself.
import { store } from "./store";

export const setValue = (value: string): void => {
  store.value = value;
};
