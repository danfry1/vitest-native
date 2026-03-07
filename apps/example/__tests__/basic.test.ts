import { describe, it, expect } from 'vitest';
import { Platform, Dimensions } from 'react-native';

describe('basic RN mocks', () => {
  it('Platform.OS is available', () => {
    expect(Platform.OS).toBe('ios');
  });

  it('Dimensions.get works', () => {
    const dims = Dimensions.get('window');
    expect(dims.width).toBe(390);
  });
});
