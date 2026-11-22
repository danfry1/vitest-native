// A project setup file: it sees the manual mocks too, and its own jest.mock(name,
// factory) and jest.unmock(name) win over them, as under Jest.
import { count } from "resident-singleton";

jest.mock("vn-lib-plain-two-entries", () => ({ entry: "setup-factory" }));
jest.unmock("rn-singleton-lib");

(globalThis as Record<string, unknown>).__setupCount = count();
