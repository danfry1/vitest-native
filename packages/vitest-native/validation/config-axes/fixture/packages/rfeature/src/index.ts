// The same shape as @axis/feature, reached through a REGEX alias (the form Jest's
// moduleNameMapper migrates to), which Node's alias fallback cannot represent.
import { store } from "@axis/rvalidator/store";

export const readStore = (): string | null => store.value;
