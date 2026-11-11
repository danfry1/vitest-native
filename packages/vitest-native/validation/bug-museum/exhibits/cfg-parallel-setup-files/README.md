# A setup file that imports react-native fails under parallel setup files

- **Class:** config
- **Source:** a survey of public projects that use vitest-native
- **Fixed by:** the setup-file order fix
- **Needs:** nothing beyond this repository's install

## The bug

An app lists its own setup file in `test.setupFiles`, and that file reads `react-native`
as its first statement. The app also sets `sequence.setupFiles: 'parallel'`. The engine already
places its setup file first in the list, but Vitest imports every setup file at once in
that mode. The app's file reaches React Native before the engine's setup has installed its
require hooks, and Node fails on React Native's Flow source: `SyntaxError: Unexpected
token 'typeof'`. No test runs.

## Expected behaviour

The engine's setup files run first, then the app's, whatever the app's sequence setting.
The app's setup file sees `Platform.OS`.
