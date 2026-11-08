---
"vitest-native": minor
---

**`vitest-native compare --hot` shows whether `hotRuntime: 'auto'` changes any test's result in your suite.** It runs your Vitest config per file and hot: twice each, plus one hot run with shuffled files and one at `--maxWorkers=2`. It matches every test by file, name and occurrence, compares failures by kind, and checks the engine's banner, so a declined `'auto'` gives no verdict. When nothing differs it prints the median speed-up; otherwise it lists each differing test. See [the CLI guide](https://vitest-native.danfry.dev/guide/cli#compare-hot). No action needed.
