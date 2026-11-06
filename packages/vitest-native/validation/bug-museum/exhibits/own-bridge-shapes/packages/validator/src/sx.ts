// Requires itself back through a Node-loaded helper (shared.js) while it evaluates.
import { viaShared } from "@m/feature";
export const first = "first";
let seen: unknown;
try {
  seen = viaShared().first;
} catch (error) {
  seen = (error as { code?: string }).code ?? String(error);
}
export { seen };
