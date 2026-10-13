// A preset of the project's own, for a library that cannot run in Node ("zz-lib",
// which is not even installed: the preset shadows it). It imports react-native and
// vitest at its top level, as a preset module may, and prepares asynchronously.
import React from "react";
import { Text } from "react-native";
import { vi } from "vitest";

export default () => ({
  name: "zzLib",
  async prepare() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    (globalThis as any).__zzLibPrepared = true;
  },
  modules: {
    "zz-lib": {
      exports: ["greet", "Badge"],
      factory: () => ({
        greet: vi.fn((name: string) => `hello ${name}`),
        Badge: ({ label }: { label: string }) => React.createElement(Text, null, label),
      }),
    },
  },
});
