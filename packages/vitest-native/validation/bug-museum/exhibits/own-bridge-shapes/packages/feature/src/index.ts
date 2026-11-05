// A React Native workspace library (it peers on react-native, so Node loads it), which
// requires project source from a second workspace library at the moment it is asked to.
export const requireStore = () => require("@m/validator/store");
export const requireLegacy = () => require("@m/validator/legacy");
export const requireReexp = () => require("@m/validator/reexp");
export const requireDyn = () => require("@m/validator/dyn");
export const requireSlow = () => require("@m/validator/slow");
export const requireTlaParent = () => require("@m/validator/tlaparent");
export const requireForAwait = () => require("@m/validator/for-await");
export const requireLiteral = () => require("@m/validator/literal");
export const requireCycle = () => require("@m/validator/cyc-a");
export const requireCycleB = () => require("@m/validator/cyc-b");
export const requireBoom = () => require("@m/validator/boom");
export const requireUsesSep = () => require("@m/validator/uses-sep");
// Called while @m/validator/back is evaluating (it imports this library): Node requires it back.
export const requireBack = () => require("@m/validator/back");
// Called while @m/validator/loop-x is evaluating: Node requires loop-y, which imports loop-x.
export const requireLoopY = () => require("@m/validator/loop-y");
// Called from the test body while @m/validator/fp-x waits on a top-level await: not a cycle.
export const requireFpX = () => require("@m/validator/fp-x");
// Called while @m/validator/fn-x is evaluating: Node requires fn-y, whose Node-loaded import
// requires fn-x back (a deeper cycle).
export const requireFnY = () => require("@m/validator/fn-y");
// Called while @m/validator/sx is evaluating, through a helper the test loaded first.
export const viaShared = () => require("./shared.js").requireSx();
// Called first: requires a module whose imports reach two copies of one package.
export const requireDupBoth = () => require("@m/validator/dup-both");
