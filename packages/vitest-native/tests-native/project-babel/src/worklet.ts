// A worklet: the worklets plugin (listed in the config) compiles it. With a Babel Vite
// plugin that runs the worklets plugin too, it is compiled twice (--mode babel-plugin).
export function double(x: number): number {
  "worklet";
  return x * 2;
}
