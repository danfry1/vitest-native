// A preset of the project's own that creates the Node-side registry while the native setup
// is still running, as a library's Jest setup file does through `jest.mock`. The
// registry's resident set must still be taken where the setup installs the sharing.
import { nodeRegistry } from "../../dist/jest-compat/node-registry.mjs";

nodeRegistry();

export default () => ({ name: "earlyRegistry", modules: {} });
