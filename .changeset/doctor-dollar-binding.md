---
"vitest-native": patch
---

**`vitest-native doctor` no longer misreads a config whose binding has `$` in its name.** It reads bindings from the config's source with regular expressions, and `$` is legal in a JavaScript identifier but an anchor in a pattern. So `import $base from "@scope/preset"; export default $base` was reported as unconfigured. An aliased `reactNative as $rn` or `import * as $vn` was reported as imported but never called. Bindings are now escaped before they are matched. No action needed.
