# Coverage

Vitest's coverage works with both engines. Install the provider at the same version as `vitest` and turn it on as usual:

```bash
npm i -D @vitest/coverage-v8
npx vitest run --coverage
```

## What is covered

Coverage reports the files your tests load from your own project, mapped back to their source lines:

- **Files Vite loads.** These are your tests and most app source. They work as they do in any Vitest project.
- **Files Node compiles (native engine).** Under `engine: 'native'`, Node loads workspace packages written for React Native (see [How It Works](/guide/how-it-works)). Babel compiles these files for Node. While coverage is on, it also writes a source map for each, so their coverage is reported against your `.ts`/`.tsx` lines like everything else.

With `provider: 'v8'` (Vitest's default), the plugin swaps in a coverage provider that knows about the files Node compiles. That provider is `@vitest/coverage-v8` with one change: for those files it reads the code Node ran from the engine's transform cache, instead of asking Vite. The report still says "Coverage report from v8". Your `include`, `exclude`, reporters and thresholds apply as before.

## What is excluded

- **`node_modules`.** This includes React Native itself, and packages that publish Flow, JSX or TypeScript source. `@vitest/coverage-v8` skips these, just as Jest's default `coveragePathIgnorePatterns` does.
- **Files outside the project root.** In a monorepo, a workspace package that lives next to your app rather than inside it is left out by default. To report it, set `coverage.allowExternal: true` and add it to `coverage.include` with a glob relative to the project root, for example `include: ['src/**', '../packages/*/src/**']`.

## Running one project with `--project`

With `--project <name>`, Vitest matches `coverage.include` against that project's root, not the root config's directory. Repo-relative patterns then match nothing, and the report comes out 0/0. For a package beside the project, use a pattern relative to the project, and allow external files:

```bash
vitest run --coverage --project app --coverage.include='../lib/src/**' --coverage.allowExternal
```

## Known differences

- In a file Node compiles, `import` and `export` lines count as statements, because Babel turns them into `require` calls and `exports` assignments. Vite-loaded files do not count those lines. Every other line gets the same verdict either way.
- App source (not a workspace package) that a test loads through Node's `require()`, for example with `jest.requireActual`, is still mapped through Vite's output. Its counts can be wrong. Import it instead where you can.
- `provider: 'istanbul'` instruments files in Vite's transform. It does not see files Node compiles, so use `v8` under the native engine.
