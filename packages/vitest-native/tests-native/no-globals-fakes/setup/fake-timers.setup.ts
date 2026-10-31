// Turns on fake timers before every file, as a suite-wide setup file does.
import { vi } from "vitest";

vi.useFakeTimers();
