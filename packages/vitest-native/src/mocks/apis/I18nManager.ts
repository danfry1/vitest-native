import { vi } from "vitest";

export function createI18nManagerMock() {
  const mock: any = {
    isRTL: false,
    doLeftAndRightSwapInRTL: true,
    allowRTL: vi.fn((_allow: boolean) => {}),
    forceRTL: vi.fn((force: boolean) => {
      mock.isRTL = force;
    }),
    swapLeftAndRightInRTL: vi.fn((swap: boolean) => {
      mock.doLeftAndRightSwapInRTL = swap;
    }),
    getConstants: vi.fn(() => ({
      isRTL: mock.isRTL,
      doLeftAndRightSwapInRTL: mock.doLeftAndRightSwapInRTL,
    })),
    _reset: () => {
      mock.isRTL = false;
      mock.doLeftAndRightSwapInRTL = true;
    },
  };
  return mock;
}
