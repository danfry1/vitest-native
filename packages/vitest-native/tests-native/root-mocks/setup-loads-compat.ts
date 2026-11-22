// A project setup file that loads jest-compat itself instead of listing it in
// test.setupFiles (#566 review): the generated manual-mocks module still runs after it.
// (By path: this fixture is outside the package, where an app would import it by name.)
import "../../dist/jest-compat/setup.mjs";
import "./setup";
