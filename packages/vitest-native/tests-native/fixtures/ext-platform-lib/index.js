// Stand-in for an ecosystem package (e.g. @react-navigation) that:
//  1. imports an extensionless relative module with a `.native.js` variant,
//  2. imports a binary asset, and
//  3. imports JSON without an import attribute, both with and without the extension,
//  4. imports a relative module whose name has a dot (`./Kind.types`, as expo-linking's
//     `./Linking.types`), with and without a platform variant (#506).
import { variant } from "./impl";
import icon from "./icon.png";
import data from "./data.json";
import settings from "./settings";
import { kind } from "./Kind.types";
import { theme } from "./Theme.config";

export const result = {
  variant,
  icon,
  answer: data.answer,
  extensionless: settings.extensionless,
  kind,
  theme,
};
