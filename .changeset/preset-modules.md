---
"vitest-native": minor
---

Presets of a project's own now work. A preset object passed to `presets: [...]` shadowed its packages with modules whose every export was undefined, under both engines: each test worker rebuilds the presets by name from vitest-native's own, and a preset's factories, being functions, cannot reach a worker from the config. A preset is now listed by the path of a module that default-exports it (or a function returning it): `presets: { './test/presets/my-lib.ts': true }` beside auto-detection, or `presets: ['./test/presets/my-lib.ts']` in a full list. The plugin reads its name and export names while loading the config, and each worker imports it, through Vitest so a TypeScript module loads. A preset object that is not exactly what one of vitest-native's factories returned, such as a built-in preset copied or extended, is refused at configuration time, naming the module form.
