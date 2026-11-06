# require('@jest/globals') reaches the real package

- **Class:** env-contract
- **Source:** react-native-paper trial (#577)
- **Fixed by:** #587 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

`jestCompatAliases()` covered `import … from '@jest/globals'`, but a CommonJS `require('@jest/globals')` in a `.js` test went to Node's resolution, which ignored the alias. It found the installed package, which throws outside Jest. Under the mock engine every suite in the app failed this way.

## Expected behaviour

`require('@jest/globals')` returns the same jest-compat globals an import gets.
