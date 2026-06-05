// Class A probe: a module-level mutable singleton, exactly like a Zustand/Redux
// store or a config object an app imports everywhere. Under proper per-file
// isolation this module is re-evaluated for each test file, so `userCount`
// resets to 0. If the user-module graph leaks across files (the isolate:false
// fear), file N sees file N-1's mutation.
export const store = { userCount: 0 };
