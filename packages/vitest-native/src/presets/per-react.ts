import type React from "react";

/**
 * `build`, run once per React module. For what a preset's module factories share, such
 * as contexts one module provides and another reads: built from the test file's React
 * (under the hot runtime's freshRuntime, each file has its own), and shared by every
 * module of the preset built with that React.
 */
export function perReact<T>(
  build: (React: typeof import("react")) => T,
): (React: typeof import("react")) => T {
  const built = new WeakMap<typeof React, T>();
  return (React) => {
    if (!built.has(React)) built.set(React, build(React));
    return built.get(React) as T;
  };
}
