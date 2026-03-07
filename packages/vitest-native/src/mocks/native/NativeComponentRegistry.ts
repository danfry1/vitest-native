import React from "react";

export function createNativeComponentRegistryMock() {
  return {
    get(name: string) {
      const Component = React.forwardRef((props: any, ref: any) => {
        return React.createElement(name, { ...props, ref });
      });
      Component.displayName = name;
      return Component;
    },
    getWithFallback(name: string) {
      return this.get(name);
    },
  };
}
