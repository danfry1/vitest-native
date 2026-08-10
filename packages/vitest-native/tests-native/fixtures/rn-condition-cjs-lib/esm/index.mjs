// The ESM build, selected by the "import" condition when "react-native" is absent.
export const entry = "esm";
export function create(initializer) {
  const state = initializer();
  return { getState: () => state };
}
