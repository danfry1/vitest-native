import type React from "react";

type ReactModule = typeof React;
type HostClass = React.ComponentClass<any>;

/**
 * The host classes of one React, by host name.
 *
 * A mock that rendered its host as a bare name (`createElement("View", { ...props, ref })`)
 * gave React 19 the `ref` as a host prop, so the test renderer's `toJSON()` (snapshots,
 * RNTL) printed `ref={null}` or the ref object, and the ref itself was the renderer's
 * node. Rendered through a class, React attaches the ref to the class instance and leaves
 * it out of the props the host receives, as the native engine's boundary does for React
 * Native's own host components (src/native/boundary.mjs). The instance carries the native
 * methods a host ref has on a device and under Jest's component mocks; each is a no-op,
 * as at the native engine's boundary.
 *
 * Keyed by the React module, which this file does not import: a preset's mock is built
 * with the test file's React (under the hot runtime's freshRuntime, each file has its
 * own), and a class extending another file's React.Component would render with that one.
 */
const byReact = new WeakMap<ReactModule, Map<string, HostClass>>();

export interface Hosts {
  /** The host class for `name`, one per name. */
  hostComponent(name: string): HostClass;
  /** A type for createElement: a host name through its class, a component as it is. */
  asHost<T>(type: T): T | HostClass;
}

/** The host helpers bound to `React`. */
export function hosts(React: ReactModule): Hosts {
  let classes = byReact.get(React);
  if (!classes) {
    classes = new Map();
    byReact.set(React, classes);
  }
  const known = classes;
  const hostComponent = (name: string): HostClass => {
    let Host = known.get(name);
    if (!Host) {
      Host = class extends React.Component<any> {
        static displayName = name;
        render() {
          return React.createElement(name, this.props);
        }
        blur() {}
        focus() {}
        measure() {}
        measureInWindow() {}
        measureLayout() {}
        setNativeProps() {}
      };
      known.set(name, Host);
    }
    return Host;
  };
  return {
    hostComponent,
    asHost: <T>(type: T) => (typeof type === "string" ? hostComponent(type) : type),
  };
}
