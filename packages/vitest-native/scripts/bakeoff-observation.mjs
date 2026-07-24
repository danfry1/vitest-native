export function classifyObservation(got, baseline) {
  if (!baseline) return "NEW";
  if (got.total !== baseline.total || got.passed < baseline.passed) return "CHANGED";
  if (got.passed > baseline.passed) return "IMPROVED";
  return "OK";
}

export function classifyObservationVerdict({ changed, infra }) {
  if (changed && infra) return "mixed";
  if (changed) return "changed";
  if (infra) return "infra";
  return "ok";
}
