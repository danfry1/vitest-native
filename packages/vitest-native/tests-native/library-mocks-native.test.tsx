/**
 * Under the native engine, these presets are the library's own Jest mock: the mock's
 * behaviour, its baselines surviving a reset, and (for bottom-sheet and netinfo) the
 * preset's own names the mock lacks, which a previous release served.
 */
import * as BottomSheet from "@gorhom/bottom-sheet";
import * as NetInfoModule from "@react-native-community/netinfo";
import { useKeyboardController } from "react-native-keyboard-controller";
import { describe, expect, it, vi } from "vitest";

describe("the library's own mock", () => {
  it("is keyboard-controller's (its hooks are mock functions)", () => {
    expect(vi.isMockFunction(useKeyboardController)).toBe(true);
  });

  it("is netinfo's: fetch resolves to its cellular state, through a reset", async () => {
    expect((await NetInfoModule.fetch()).type).toBe("cellular");
    vi.resetAllMocks();
    expect((await NetInfoModule.fetch()).type).toBe("cellular");
  });
});

describe("the preset's names a library's mock lacks", () => {
  it("keeps bottom-sheet's 5.x enums and footer", () => {
    expect(BottomSheet.ANIMATION_STATUS.RUNNING).toBe(1);
    expect(BottomSheet.BottomSheetFooter).toBeDefined();
  });

  it("keeps netinfo's useNetInfoInstance", () => {
    expect(typeof NetInfoModule.useNetInfoInstance).toBe("function");
  });
});
