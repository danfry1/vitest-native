// A preset of the project's own, for a library that cannot run in Node ("zz-lib",
// which is not even installed: the preset shadows it). It imports react-native and
// vitest at its top level, as a preset module may, and prepares asynchronously, more
// slowly than the rest of the setup runs, so a setup that did not wait for it would
// reach the user's setup file first (readiness.setup.ts records whether it did).
import React from "react";
import { Text } from "react-native";
import { vi } from "vitest";

export default () => ({
  name: "zzLib",
  async prepare() {
    await new Promise((resolve) => setTimeout(resolve, 200));
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
