// Imports vn-esm-only-lib/cid from its own copy, linked as a workspace or `file:`
// dependency is: node_modules/vn-esm-only-lib is a link to fixtures/vn-esm-only-lib-v2,
// whose real path is outside node_modules.
export { CID } from "vn-esm-only-lib/cid";
