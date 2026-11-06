// Imports the package's own entry: a cycle through index.js.
import * as root from "./index.js";

export const helper = () => typeof root.fn;
