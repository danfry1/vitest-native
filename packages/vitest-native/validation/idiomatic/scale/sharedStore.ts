// Shared module-level store imported by many generated files. Each file asserts
// it starts fresh — so if per-file module reset fails under hot, later files see
// a polluted starting value.
let total = 0;
export const bumpTotal = () => ++total;
export const readTotal = () => total;

// A resident counter of how many event listeners are currently registered on a
// resident emitter, used by the accumulation probes to detect leaked listeners.
export const tally = { fires: 0 };
