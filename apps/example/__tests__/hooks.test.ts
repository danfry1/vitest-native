import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react-native';
import { useDimensions } from '../src/hooks/useDimensions';

describe('useDimensions', () => {
  it('returns current window dimensions', () => {
    const { result } = renderHook(() => useDimensions());
    expect(result.current).toHaveProperty('width');
    expect(result.current).toHaveProperty('height');
    expect(result.current.width).toBeGreaterThan(0);
  });
});
