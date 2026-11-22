import React from "react";
import { hosts } from "./host-classes.js";

/**
 * The mock engine's host components, one class per host name, bound to the React this
 * module imports (src/mocks/host-classes.ts has why a host renders through a class).
 * Presets take theirs from `hosts(React)` with the test file's React instead.
 */
const bound = hosts(React);

export const hostComponent: (name: string) => React.ComponentClass<any> = bound.hostComponent;

/**
 * A type for createElement: a host name through its class (as hostComponent), anything
 * else, a component, as it is. For mocks whose host type is a variable.
 */
export function asHost<T>(type: T): T | React.ComponentClass<any> {
  return bound.asHost(type);
}
