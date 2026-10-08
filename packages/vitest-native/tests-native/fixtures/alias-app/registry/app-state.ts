import { AppState } from "react-native";

// Module-level state, so a fresh evaluation is observable: each load gets its own
// token and reads AppState when it is evaluated.
export const loadToken = Symbol("app-state load");
export const initialState: string | null = AppState.currentState;
export function onChange(listener: (state: string) => void): { remove(): void } {
  return AppState.addEventListener("change", listener);
}
