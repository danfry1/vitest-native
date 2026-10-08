import { Sentry } from "./sentry";

export function trace(name: string): unknown {
  return Sentry.startInactiveSpan(name);
}
