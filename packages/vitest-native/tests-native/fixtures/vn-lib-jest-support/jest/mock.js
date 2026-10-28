// As react-native-safe-area-context/jest/mock does: the real package, with a member
// replaced, through @jest/globals.
const { jest } = require("@jest/globals");
const actual = jest.requireActual("vn-lib-jest-support");
module.exports = { ...actual, extra: jest.fn(() => "extra"), actualRead: actual.read };
