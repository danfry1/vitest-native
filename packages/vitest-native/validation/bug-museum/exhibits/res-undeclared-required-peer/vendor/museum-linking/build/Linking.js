// expo-linking's shape: ES module syntax in a CommonJS-typed package, with an
// extensionless import of a sibling file.
import { scheme } from "./Linking.types";

export function createURL(path) {
  return `${scheme}://${path}`;
}
