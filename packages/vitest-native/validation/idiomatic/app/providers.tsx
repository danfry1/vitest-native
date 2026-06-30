import * as React from "react";

// Three nested providers consumed deep in the tree (auth, theme, settings) —
// the kind of provider stack a real app wraps its navigator in.
type Auth = { user: string | null; login: (u: string) => void; logout: () => void };
const AuthContext = React.createContext<Auth>({ user: null, login: () => {}, logout: () => {} });
const ThemeContext = React.createContext<{ theme: "light" | "dark"; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});
const SettingsContext = React.createContext<{ analytics: boolean }>({ analytics: false });

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const auth = React.useMemo<Auth>(
    () => ({ user, login: setUser, logout: () => setUser(null) }),
    [user],
  );
  const themeValue = React.useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }),
    [theme],
  );
  return (
    <SettingsContext.Provider value={{ analytics: true }}>
      <ThemeContext.Provider value={themeValue}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </ThemeContext.Provider>
    </SettingsContext.Provider>
  );
}

export const useAuth = () => React.useContext(AuthContext);
export const useTheme = () => React.useContext(ThemeContext);
export const useSettings = () => React.useContext(SettingsContext);
