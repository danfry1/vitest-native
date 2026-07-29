// Two named exports so an async-factory mock can keep one real and replace the
// other — the shape a migrated suite reaches for when it needs requireActual.
export const readSetting = () => "real-setting";
export const writeSetting = () => "real-write";
