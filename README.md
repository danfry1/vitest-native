<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/danfry1/vitest-native/main/website/public/lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/danfry1/vitest-native/main/website/public/lockup.svg" alt="vitest-native" width="335" height="64">
  </picture>
</h1>

[![npm](https://img.shields.io/npm/v/vitest-native)](https://www.npmjs.com/package/vitest-native)
[![npm downloads](https://img.shields.io/npm/dm/vitest-native)](https://npmcharts.com/compare/vitest-native?interval=30)
[![RN fidelity](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdanfry1%2Fvitest-native%2Fmain%2Fpackages%2Fvitest-native%2Fcrosscheck%2Ffidelity-badge.json)](https://vitest-native.danfry.dev/guide/fidelity)
[![license](https://img.shields.io/npm/l/vitest-native)](https://github.com/danfry1/vitest-native/blob/main/LICENSE)

**Test React Native with Vitest, against real React Native.**

vitest-native is a Vitest plugin. Your tests run React Native's real JavaScript, the same code
that ships in your app, and only the native modules and native host components are mocked.
It works the same for bare React Native and Expo apps.

**📖 Documentation: [vitest-native.danfry.dev](https://vitest-native.danfry.dev/)**

## Why not Jest's preset?

Jest's React Native preset also runs real React Native JavaScript, but it swaps the core components
(`View`, `Text`, `ScrollView`, `TextInput`, `Image`, `Modal`) for simple stand-ins. vitest-native's
mock boundary sits lower, so your tests run React Native's real component code.

| | Jest + RN preset | vitest-native |
|---|---|---|
| Core components (`View`, `Text`, …) | Stand-ins | Real |
| Native modules and host components | Mocked | Mocked |
| Rendered host names | `View`, `Text` | `RCTView`, `RCTText` |

A lightweight pure-JS mock engine is also available (`engine: 'mock'`) for tests that need no React
Native at all. See the [comparison with Jest](https://vitest-native.danfry.dev/guide/comparison) and
[choosing an engine](https://vitest-native.danfry.dev/guide/engines).

## Who it's for

- **New React Native projects, and new tests.** There is nothing to migrate.
- **Teams that want real-React-Native fidelity** in component, accessibility and integration tests.
- **Teams already on Vitest** for web or server code who want one runner.
- **Teams adopting incrementally:** new tests run on vitest-native while an existing Jest suite
  keeps running.

Migrating a large Jest suite is incremental, not turnkey.

## Proof

- **Behavioral cross-check.** The same probes run under the mock engine and under real React
  Native, across every React Native version CI supports, and any difference fails the build. The
  badge above shows the current count; the [fidelity report](https://vitest-native.danfry.dev/guide/fidelity) lists every probe.
- **Packed consumers in CI.** The release tarball is installed into bare React Native, Expo SDK 57
  and 58 apps (with expo-router), and npm and pnpm workspace monorepos, and their tests run in CI.
- **Real apps, as observations.** Public apps are run in the
  [bake-offs repository](https://github.com/danfry1/vitest-native-bakeoffs), with each app's setup
  in the repository. Their results are not capability claims; see the
  [validation model](https://vitest-native.danfry.dev/guide/validation-model).
- **Performance.** vitest-native is not a speed play. Each test file gets a fresh worker by
  default; the opt-in hot runtime reuses workers, and whether that is faster depends on your suite,
  so measure it.

## Quick start

```bash
npm install -D vitest vite vitest-native @testing-library/react-native
```

`vitest` and `vite` are peer dependencies, and `@testing-library/react-native` is optional. React
Native and Expo apps already have the Babel packages the default engine uses.
`npx vitest-native init` writes this config (as `vitest.config.mts` in a TypeScript project), or add it yourself:

<!-- doc-snippet: vitest.config.mts -->
```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative()],
});
```

Write a test:

<!-- doc-snippet: src/readme-greeting.test.tsx -->
```tsx
// Greeting.test.tsx
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

test("renders a greeting", async () => {
  await render(<Text>Hello, World</Text>);
  expect(screen.getByText("Hello, World")).toBeTruthy();
});
```

Run it with `npx vitest`, or add `"test": "vitest"` to your scripts. If something looks off,
`npx vitest-native doctor` checks your versions, engine and presets.

## Coming from Jest or jest-expo

`npx vitest-native migrate` reads your Jest config and reports what maps over; `--write` saves the
suggested Vitest config. Existing `jest.fn`, `jest.mock` and `jest.useFakeTimers` calls keep working
through the jest-compat layer. See [migrating from Jest](https://vitest-native.danfry.dev/migration/from-jest) and the
[Expo guide](https://vitest-native.danfry.dev/guide/expo).

## Requirements

| | Supported |
|---|---|
| Node.js | 22.22.3+ on Node 22, 24.12+ on Node 24, or 26+ |
| Vitest | 5.x |
| Vite | ^8.0.5 |
| React | 19 or later |
| React Native | 0.86–0.88 |
| Expo SDK | 57 and 58 |
| React Native Testing Library | 13.x or 14.x (optional) |

Use the React version your React Native release requires, and a `@react-native/babel-preset`
that matches its minor version. Each Node line starts at the release where Node's in-thread
module hooks work; on an older Node the plugin stops at startup with `UNSUPPORTED_NODE`.

## Learn more

- [Choosing an engine](https://vitest-native.danfry.dev/guide/engines) and the [hot runtime](https://vitest-native.danfry.dev/guide/hot-runtime)
- [Third-party presets](https://vitest-native.danfry.dev/guide/presets) (Reanimated, Gesture Handler, Navigation, …)
- [Expo](https://vitest-native.danfry.dev/guide/expo) · [Plugin options](https://vitest-native.danfry.dev/guide/plugin-options) · [Test helpers](https://vitest-native.danfry.dev/guide/helpers)
- [Coverage](https://vitest-native.danfry.dev/guide/coverage) · [CLI](https://vitest-native.danfry.dev/guide/cli) · [Troubleshooting](https://vitest-native.danfry.dev/guide/troubleshooting)
- [Release notes for 0.14](https://vitest-native.danfry.dev/releases/0.14) · [Changelog](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md)

## Status

Beta. What is covered by semver, what is experimental and what 1.0 will mean are set out in
[versioning and stability](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/docs/versioning.md).
vitest-native is the maintained successor to
[`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native),
rebuilt for Vitest 5; see [migrating from it](https://vitest-native.danfry.dev/migration/from-vitest-react-native).

## Contributing

```bash
bun install
bun run --filter vitest-native build
bun run --filter vitest-native test
```

## Contributors

Thanks to everyone who has opened an issue or a pull request, or landed a commit. Each one has
shaped vitest-native.

<!-- contributors:start -->
<table>
  <tr>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/impsdc"><img src="https://github.com/impsdc.png?size=128" width="64" height="64" alt="impsdc" /><br /><sub><b>impsdc</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Aimpsdc&type=issues">2 issues</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/jakeboone02"><img src="https://github.com/jakeboone02.png?size=128" width="64" height="64" alt="jakeboone02" /><br /><sub><b>jakeboone02</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Ajakeboone02&type=issues">1 issue, 2 pull requests</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/Doko-Demo-Doa"><img src="https://github.com/Doko-Demo-Doa.png?size=128" width="64" height="64" alt="Doko-Demo-Doa" /><br /><sub><b>Doko-Demo-Doa</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3ADoko-Demo-Doa&type=issues">1 pull request</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/swey"><img src="https://github.com/swey.png?size=128" width="64" height="64" alt="swey" /><br /><sub><b>swey</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Aswey&type=issues">1 issue, 3 pull requests</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/doutatsu"><img src="https://github.com/doutatsu.png?size=128" width="64" height="64" alt="doutatsu" /><br /><sub><b>doutatsu</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Adoutatsu&type=issues">2 issues</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/Joozty"><img src="https://github.com/Joozty.png?size=128" width="64" height="64" alt="Joozty" /><br /><sub><b>Joozty</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3AJoozty&type=issues">1 issue, 1 pull request</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/believer"><img src="https://github.com/believer.png?size=128" width="64" height="64" alt="believer" /><br /><sub><b>believer</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Abeliever&type=issues">1 issue</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/AntSplash360"><img src="https://github.com/AntSplash360.png?size=128" width="64" height="64" alt="AntSplash360" /><br /><sub><b>AntSplash360</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3AAntSplash360&type=issues">1 issue</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/OpenDeernet"><img src="https://github.com/OpenDeernet.png?size=128" width="64" height="64" alt="OpenDeernet" /><br /><sub><b>OpenDeernet</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3AOpenDeernet&type=issues">1 pull request</a></sub>
    </td>
    <td align="center" valign="top" width="120">
      <a href="https://github.com/arvidtorbjoernsen"><img src="https://github.com/arvidtorbjoernsen.png?size=128" width="64" height="64" alt="arvidtorbjoernsen" /><br /><sub><b>arvidtorbjoernsen</b></sub></a><br />
      <sub><a href="https://github.com/search?q=repo%3Adanfry1%2Fvitest-native+author%3Aarvidtorbjoernsen&type=issues">1 issue</a></sub>
    </td>
  </tr>
</table>
<!-- contributors:end -->

## License

MIT
