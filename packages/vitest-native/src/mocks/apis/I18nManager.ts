import { vi } from "vitest";

/** Resting layout direction, written once — see Keyboard.ts for why not twice. */
const RESTING = { isRTL: false, doLeftAndRightSwapInRTL: true };

export function createI18nManagerMock() {
  const mock: any = {
    ...RESTING,
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
      Object.assign(mock, RESTING);
    },
  };
  return mock;
}
