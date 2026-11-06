// A project setup file loads a root-mocked package too, as under Jest.
import { count } from "resident-singleton";

(globalThis as Record<string, unknown>).__setupCount = count();
