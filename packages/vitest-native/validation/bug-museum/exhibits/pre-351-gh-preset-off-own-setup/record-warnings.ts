// Gesture Handler warns from a microtask while it loads, before any test runs.
const warnings: string[] = [];
(globalThis as Record<string, unknown>).__ghWarnings = warnings;
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (String(args[0]).startsWith("[react-native-gesture-handler]")) warnings.push(String(args[0]));
  warn(...(args as []));
};
