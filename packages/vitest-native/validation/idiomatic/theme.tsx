import * as React from "react";
import { Switch, Text, View } from "react-native";

type Theme = "light" | "dark";
const ThemeContext = React.createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("light");
  const value = React.useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeScreen() {
  const { theme, toggle } = React.useContext(ThemeContext);
  return (
    <View>
      <Text testID="theme-label">Theme: {theme}</Text>
      <Switch testID="theme-switch" value={theme === "dark"} onValueChange={toggle} />
    </View>
  );
}
