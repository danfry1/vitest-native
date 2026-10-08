import { device } from "@vn-app/registry/storage";

export const kind = "web";
export function sessionId(): string {
  return device.get("session");
}
