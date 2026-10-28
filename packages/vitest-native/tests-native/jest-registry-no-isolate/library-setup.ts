// A migrated suite's own setup file importing a library's jestSetup, which runs once
// per worker under `isolate: false`: its mocks have to reach every file (c1, c2).
import "vn-lib-jest-support/jestSetup.js";
