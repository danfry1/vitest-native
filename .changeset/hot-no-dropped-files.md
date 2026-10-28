---
"vitest-native": patch
---

The hot runtime no longer drops test files from a run. When a test file `jest.mock`ed a module that the per-file reset restores through Node, such as `jest.mock('react-native/Libraries/Utilities/Appearance', () => null)`, the reset for the next file threw before that file was collected. The file then had no result in any reporter, and the JSON report did not show it at all. With one worker, every later file of the run was lost the same way. On react-native-paper this dropped one file per run with four workers and 19 of 52 files with one. The `jest.mock` registrations are now cleared before the React Native state is restored. A reset that fails now fails the file it was for, with the error. A file that never runs because its worker's task broke is now reported as failed by name, and the run fails.
