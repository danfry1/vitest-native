// A React Native workspace library: it peers on react-native and exports ./package.json,
// so the engine detects it and Node owns its source.
export const registry: { setupRan: boolean } = { setupRan: false };
