// Native variant. The web variant beside it is what tests pull in with
// jest.requireActual('…/index.web').
export const kind = "native";
export function sessionId(): string {
  return "native-session";
}
