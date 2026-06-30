import * as React from "react";

// A minimal hand-rolled stack navigator (push/pop with params) — the navigation
// pattern a real app relies on, without pulling in a navigation library.
type Route = { name: string; params?: Record<string, unknown> };
type Nav = {
  route: Route;
  navigate: (name: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
  canGoBack: boolean;
};
const NavContext = React.createContext<Nav>({
  route: { name: "" },
  navigate: () => {},
  goBack: () => {},
  canGoBack: false,
});

export function Navigator({
  initial,
  screens,
}: {
  initial: string;
  screens: Record<string, React.ComponentType>;
}) {
  const [stack, setStack] = React.useState<Route[]>([{ name: initial }]);
  const route = stack[stack.length - 1];
  const nav = React.useMemo<Nav>(
    () => ({
      route,
      navigate: (name, params) => setStack((s) => [...s, { name, params }]),
      goBack: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      canGoBack: stack.length > 1,
    }),
    [route, stack.length],
  );
  const Screen = screens[route.name];
  return <NavContext.Provider value={nav}>{Screen ? <Screen /> : null}</NavContext.Provider>;
}

export const useNav = () => React.useContext(NavContext);
