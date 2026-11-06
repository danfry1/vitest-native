// An ES import cycle: cyc-a imports cyc-b, which imports cyc-a back.
import { b } from "./cyc-b";
export const a = () => "a" + b();
