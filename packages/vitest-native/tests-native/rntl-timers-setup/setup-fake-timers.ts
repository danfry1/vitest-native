// A setup file that turns fake timers on for every test file, so RNTL loads while
// they are on (Jest's `fakeTimers: { enableGlobally: true }`, migrated).
import { vi } from "vitest";

vi.useFakeTimers();
