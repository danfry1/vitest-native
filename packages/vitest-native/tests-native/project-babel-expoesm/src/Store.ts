// A routed file with a decorator, a static import and import().
import { later } from "./later";

function field() {
  return () => ({
    configurable: true,
    get(this: { _raw: Record<string, string> }) {
      return this._raw.name;
    },
    set(this: { _raw: Record<string, string> }, value: string) {
      this._raw.name = value;
    },
  });
}

export class Store {
  _raw: Record<string, string> = {};
  @field() name!: string;
}

export const staticValue = later;
export const loadLater = () => import("./later");
