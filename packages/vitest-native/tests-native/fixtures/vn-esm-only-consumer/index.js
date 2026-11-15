import { CID } from "vn-esm-only-lib/cid";

export { CID };

export function parse(text) {
  return CID.parse(text);
}
