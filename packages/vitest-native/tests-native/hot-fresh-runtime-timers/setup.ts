// A setup file that turns on fake timers and sets the clock, before the test file loads
// RNTL. RNTL, as it loads, swaps to real timers and back, which reinstalls the fake timers
// and drops the set time: in every file under per-file isolation and freshRuntime, only in
// the first file a hot worker runs while RNTL stays resident.
import { vi } from "vitest";

vi.useFakeTimers();
vi.setSystemTime(new Date("2001-06-01T00:00:00Z"));
