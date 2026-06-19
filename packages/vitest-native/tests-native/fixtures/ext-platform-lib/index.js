// Stand-in for an ecosystem package (e.g. @react-navigation) that:
//  1. imports an extensionless relative module with a `.native.js` variant,
//  2. imports a binary asset, and
//  3. imports JSON without an import attribute.
import { variant } from "./impl";
import icon from "./icon.png";
import data from "./data.json";

export const result = { variant, icon, answer: data.answer };
