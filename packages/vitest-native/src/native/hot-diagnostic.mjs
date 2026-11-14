// The hot runtime's diagnostics go to stderr directly. Vitest drops console output made
// while it starts a file, which is when the per-file reset runs, so a console.log there
// never printed (#775). One path for every worker-side hot diagnostic keeps them visible
// wherever in a file's life they are written.
export function hotDiagnostic(message) {
  process.stderr.write(`[vitest-native] ${message}\n`);
}
