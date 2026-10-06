// Fixture for jest-compat-semantics.test.tsx: app code reading the environment
// module at call time, and importing a name the test's mock factory leaves out.
import { IS_WEB, PROXY_DID } from "./env";

export const textDirection = () => (IS_WEB ? "web" : "native");
export const proxyDid = () => PROXY_DID;
