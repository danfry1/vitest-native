// The library's own setup file: loads its vitest helper, mocks one of its modules and
// writes to its store.
import { vi } from "vitest";
import "./testing/helpers";
import { setValue } from "./src/index";

vi.mock("./src/helper", () => ({ greet: () => "setup-mocked" }));
setValue("from-setup");
