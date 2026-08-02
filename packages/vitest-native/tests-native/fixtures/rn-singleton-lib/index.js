// A React Native ecosystem package as they are actually published: untranspiled
// source (ESM syntax and JSX) that assumes Metro will compile it, plus
// module-level state — the shape every store, context and event emitter has.
//
// It declares react-native in its own manifest, which is what makes the engine
// detect it as an ecosystem package, and it is a declared dependency of this
// package so that detection actually considers it. A fixture that is not a
// declared dependency is never a candidate, which silently invalidated three
// separate measurements before this existed.
const store = { value: undefined, loadedBy: null };

export function configure(value) {
  store.value = value;
}
export function read() {
  return store.value ?? "";
}
export function markLoader(name) {
  store.loadedBy = store.loadedBy ?? name;
  return store.loadedBy;
}
export const Badge = () => <text>badge</text>;
