// Memory gate (part 1/3): the hot runtime must unmount each file's RNTL trees,
// not just isolate state. RNTL keeps mounted roots in a module-level cleanupQueue
// and registers its auto-cleanup afterEach only when its module first evaluates —
// once, since RNTL is resident under the native engine. Under the hot worker that
// afterEach does not fire reliably across files, so without the per-file
// resident-RNTL drain (reset.mjs) every file's tree stays mounted in the resident
// instance: a memory accumulation that grows ~linearly with render-heavy files.
//
// This trio proves the drain runs, using the resident `screen` rather than an
// unmount-effect side effect (effect-destroy callbacks are not reliably flushed
// when cleanup() unmounts between files; clearRenderResult — which cleanup() also
// runs — is a plain reference drop, so it is a stable, flush-independent signal).
// File a renders a uniquely identifiable tree; files b and c assert the PREVIOUS
// file's tree is gone from the resident screen, i.e. the drain unmounted it.
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import { it } from "vitest";

it("file a renders a uniquely identifiable RNTL tree", () => {
  render(React.createElement(Text, null, "vn-hot-tree-from-a"));
});
