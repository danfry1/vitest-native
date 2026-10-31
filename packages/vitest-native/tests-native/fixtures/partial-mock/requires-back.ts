// The real module of a mock whose import graph requires the mocked module back
// through Node, from CommonJS (legacy/requires-back.js).
import requiresBack from "./legacy/requires-back.js";

export const real = (): string => "real";
export const attempt: { value?: unknown; error?: { code?: string; message: string } } =
  requiresBack.attempt;
