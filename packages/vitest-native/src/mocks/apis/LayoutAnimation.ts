import { vi } from "vitest";

export function createLayoutAnimationMock() {
  return {
    configureNext: vi.fn(),
    create: vi.fn(() => ({
      duration: 300,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    })),
    Types: {
      spring: "spring",
      linear: "linear",
      easeInEaseOut: "easeInEaseOut",
      easeIn: "easeIn",
      easeOut: "easeOut",
    },
    Properties: {
      opacity: "opacity",
      scaleX: "scaleX",
      scaleY: "scaleY",
      scaleXY: "scaleXY",
    },
    Presets: {
      easeInEaseOut: {
        duration: 300,
        create: { type: "easeInEaseOut", property: "opacity" },
        update: { type: "easeInEaseOut" },
        delete: { type: "easeInEaseOut", property: "opacity" },
      },
      linear: {
        duration: 500,
        create: { type: "linear", property: "opacity" },
        update: { type: "linear" },
        delete: { type: "linear", property: "opacity" },
      },
      spring: {
        duration: 700,
        create: { type: "linear", property: "opacity" },
        update: { type: "spring", springDamping: 0.4 },
        delete: { type: "linear", property: "opacity" },
      },
    },
  };
}
