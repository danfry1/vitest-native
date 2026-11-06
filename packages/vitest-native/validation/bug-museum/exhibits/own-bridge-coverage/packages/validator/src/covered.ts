import { prefix } from "./prefix";
export function pick(flag: boolean): string {
  if (flag) {
    return prefix + "taken";
  }
  return prefix + "not taken";
}

export const picked = pick(true);
