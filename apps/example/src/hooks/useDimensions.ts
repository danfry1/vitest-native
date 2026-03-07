import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

export function useDimensions() {
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const handler = ({ window }: any) => setDims(window);
    const subscription = Dimensions.addEventListener('change', handler);
    return () => subscription?.remove();
  }, []);

  return dims;
}
