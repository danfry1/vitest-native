// Imports vn-esm-only-lib/cid from its own nested copy of the package
// (node_modules/vn-esm-only-lib, from fixtures/vn-esm-only-lib-v2), not the root one.
import { CID } from "vn-esm-only-lib/cid";

export { CID };

export function parse(text) {
  return CID.parse(text);
}
