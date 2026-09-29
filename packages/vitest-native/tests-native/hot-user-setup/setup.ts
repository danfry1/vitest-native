// A project setup file that installs fake timers for every test file through the
// jest-compat layer, as react-native-paper's does. Vitest runs it BEFORE this
// package's own setup file, so the hot runtime must already have reset the previous
// file's state at the file boundary.
declare const jest: { useFakeTimers(): void };

jest.useFakeTimers();
