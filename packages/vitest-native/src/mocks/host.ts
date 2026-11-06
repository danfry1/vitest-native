import React from "react";

/**
 * The mock engine's host components, one class per host name.
 *
 * A mock that rendered its host as a bare name (`createElement("View", { ...props, ref })`)
 * gave React 19 the `ref` as a host prop, so the test renderer's `toJSON()` (snapshots,
 * RNTL) printed `ref={null}` or the ref object, and the ref itself was the renderer's
 * node. Rendered through this class, React attaches the ref to the class instance and
 * leaves it out of the props the host receives, as the native engine's boundary does for
 * React Native's own host components (src/native/boundary.mjs). The instance carries the
 * native methods a host ref has on a device and under Jest's component mocks; each is a
 * no-op, as at the native engine's boundary.
 */
const classes = new Map<string, React.ComponentClass<any>>();

export function hostComponent(name: string): React.ComponentClass<any> {
  let Host = classes.get(name);
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
    classes.set(name, Host);
  }
  return Host;
}

/**
 * A type for createElement: a host name through its class (as hostComponent), anything
 * else, a component, as it is. For mocks whose host type is a variable.
 */
export function asHost<T>(type: T): T | React.ComponentClass<any> {
  return typeof type === "string" ? hostComponent(type) : type;
}
