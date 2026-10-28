// Teaches React Native Testing Library that "RCTVirtualText" is a text host.
//
// Real React Native renders a top-level <Text> as the host "RCTText" and a <Text>
// nested inside another as "RCTVirtualText" (Libraries/Text/Text.js picks
// NativeVirtualText when TextAncestorContext is set). RNTL's text hosts are
// ['Text', 'RCTText'], so under the native engine a nested <Text> is not a text
// element to RNTL: getByText cannot find it on its own. Jest's preset never shows
// this because it mocks Text to one flat "Text" host. The mock engine does the
// same, so this is native-engine only.
//
// RNTL decides through its helpers/host-component-names module, in one of two
// shapes:
//   - RNTL 14 (dist/) exports the list, HOST_TEXT_NAMES. test-renderer also reads
//     it to decide where string children may live, so without RCTVirtualText a
//     nested <Text> throws "Text strings must be rendered within a <Text>
//     component". Adding the name to the list fixes both.
//   - RNTL 12 and 13 (build/) export only the predicate isHostText (13 tests a
//     private ['Text', 'RCTText']; 12 compares with the detected
//     getHostComponentNames().text, which is "RCTText"). Every caller of it in
//     those builds reads it through the module's exports object at call time, as
//     Babel's CommonJS output does — `(0, _hostComponentNames.isHostText)(node)` —
//     so replacing the export reaches all of them.
//
// Known gap, RNTL 12: role queries. Its isAccessibilityElement
// (build/helpers/accessibility.js) does not call isHostText; it compares the type
// with getHostComponentNames().text directly. So on RNTL 12 a nested
// `<Text accessibilityRole="link">` is found by getByText but not by
// getByRole("link"); RNTL 13 and 14 go through isHostText and find it. This is
// deliberately left unpatched: replacing RNTL's exports is a stopgap, and RNTL
// handling is to move into a per-major RNTL adapter rather than gain more patches
// here.

const VIRTUAL_TEXT = "RCTVirtualText";
const WRAPPED = Symbol.for("vitest-native.rntl-virtual-text-host");

/**
 * Registers RCTVirtualText as a text host on RNTL's host-component-names module.
 * Idempotent: setup files run once per test file against one cached module.
 *
 * @param {Record<string, unknown> | null | undefined} hostComponentNames
 * @returns {"list" | "predicate" | null} which shape was patched (or already
 *   was); null when the module has neither, which leaves RNTL as it is.
 */
export function registerVirtualTextHost(hostComponentNames) {
  if (!hostComponentNames) return null;
  const list = hostComponentNames.HOST_TEXT_NAMES;
  if (Array.isArray(list)) {
    if (!list.includes(VIRTUAL_TEXT)) list.push(VIRTUAL_TEXT);
    return "list";
  }
  const isHostText = hostComponentNames.isHostText;
  if (typeof isHostText !== "function") return null;
  if (isHostText[WRAPPED]) return "predicate";
  const wrapped = (element) => element?.type === VIRTUAL_TEXT || isHostText(element);
  wrapped[WRAPPED] = true;
  try {
    hostComponentNames.isHostText = wrapped;
  } catch {
    // A frozen exports object throws in strict mode; reported below as unpatched.
  }
  // An export that cannot be replaced (a getter, a frozen namespace) is reported as
  // unpatched rather than as a success that never happened.
  return hostComponentNames.isHostText === wrapped ? "predicate" : null;
}
