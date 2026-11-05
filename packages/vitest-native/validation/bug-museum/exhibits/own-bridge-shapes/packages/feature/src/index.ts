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
