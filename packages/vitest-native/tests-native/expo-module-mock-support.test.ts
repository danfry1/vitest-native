// The main native suite: jest-compat's global `jest` is present, and the mock file
// must still get a jest of its own. The no-globals suite runs the same cases without any.
import { defineExpoModuleMockCases } from "./support/expo-module-mock-cases";

defineExpoModuleMockCases();
