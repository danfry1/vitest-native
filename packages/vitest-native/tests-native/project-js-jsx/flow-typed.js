// @flow
// A Flow file whose generic looks like JSX to a quick scan. Oxc cannot parse it, so it
// is served unchanged and the config's `project-flow` plugin strips it, as an app's own
// Babel/Flow plugin would.
export function joined(parts: Array<string>): string {
  return parts.join(",");
}
