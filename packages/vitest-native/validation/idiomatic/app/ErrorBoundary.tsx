import * as React from "react";
import { Text } from "react-native";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <Text testID="boundary">Something went wrong</Text>;
    return this.props.children;
  }
}

export function Crashy({ crash }: { crash: boolean }) {
  if (crash) throw new Error("boom");
  return <Text testID="ok">fine</Text>;
}
