import React from "react";

export function createUseColorSchemeMock() {
  let scheme: "light" | "dark" = "light";
  const listeners = new Set<(s: "light" | "dark") => void>();

  const hook = () => {
    try {
      const [currentScheme, setCurrentScheme] = React.useState(scheme);

      React.useEffect(() => {
        listeners.add(setCurrentScheme);
        return () => {
          listeners.delete(setCurrentScheme);
        };
      }, []);

      return currentScheme;
    } catch {
      return scheme;
    }
  };

  hook._setScheme = (s: "light" | "dark") => {
    scheme = s;
    listeners.forEach((fn) => fn(s));
  };

  hook._resetScheme = (s: "light" | "dark") => {
    scheme = s;
    listeners.clear();
  };

  return hook;
}
