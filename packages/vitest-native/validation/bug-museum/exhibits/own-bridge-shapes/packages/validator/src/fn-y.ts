// Imports a Node-loaded file that requires fn-x back.
import { requireX } from "../../feature/src/second.js";
let seen: unknown;
try {
  seen = requireX().x;
} catch (error) {
  seen = (error as { code?: string }).code ?? String(error);
}
export { seen };
