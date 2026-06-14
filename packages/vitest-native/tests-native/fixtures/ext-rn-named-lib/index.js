// A stand-in for a real externalized ESM dependency (e.g. uniwind) that does a
// NAMED import of getter-based React Native exports. RN's index defines these via
// lazy getters, which cjs-module-lexer can't see — so without the loader's ESM
// facade this import throws "does not provide an export named 'Appearance'".
import { Appearance, I18nManager, Vibration } from 'react-native'

export const resolved = {
  Appearance: Appearance != null,
  I18nManager: I18nManager != null,
  Vibration: Vibration != null,
}
