---
"vitest-native": patch
---

**Under the hot runtime, a file that mocks `react-native` partially no longer breaks RNTL in later files.** When RNTL first loaded in a file with `jest.mock('react-native', () => ({ Platform: … }))`, it kept that mock for the worker's life, and later files failed in `fireEvent` with `Cannot read properties of undefined (reading 'flatten')`. React's, its renderers' and RNTL's own requires now get the actual module under hot; the file's code still gets its mock. No action needed.
