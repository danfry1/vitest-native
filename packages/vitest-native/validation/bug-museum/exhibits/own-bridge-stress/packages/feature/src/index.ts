// A React Native workspace library (it peers on react-native, so Node loads it) that
// requires one slice of a generated project graph when asked.
export const requireSlice = (slice: number) => require(`@m/validator/gen/s${slice}m0`);
