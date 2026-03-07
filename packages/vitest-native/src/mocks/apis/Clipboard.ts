import { vi } from "vitest";

export function createClipboardMock() {
  let content = "";
  return {
    getString: vi.fn(() => Promise.resolve(content)),
    setString: vi.fn((text: string) => {
      content = text;
    }),
    hasString: vi.fn(() => Promise.resolve(content.length > 0)),
  };
}
