import React from "react";

export function createUseWindowDimensionsMock() {
  let dims = { width: 390, height: 844, scale: 3, fontScale: 1 };
  const listeners = new Set<(d: typeof dims) => void>();

  const hook = () => {
    try {
      const [currentDims, setCurrentDims] = React.useState({ ...dims });

      React.useEffect(() => {
        listeners.add(setCurrentDims);
        return () => {
          listeners.delete(setCurrentDims);
        };
      }, []);

      return currentDims;
    } catch {
      return { ...dims };
    }
  };

  hook._setDimensions = (d: {
    width: number;
    height: number;
    scale?: number;
    fontScale?: number;
  }) => {
    dims = { ...dims, ...d };
    listeners.forEach((fn) => fn({ ...dims }));
  };

  hook._resetDimensions = (d: typeof dims) => {
    dims = { ...d };
    listeners.clear();
  };

  return hook;
}
