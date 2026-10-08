export const Sentry = {
  startInactiveSpan: (name: string): { name: string; real: true } => ({ name, real: true }),
};
