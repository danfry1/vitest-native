import React from "react";
import { Text } from "react-native";

/** Shows "ready" once a `setTimeout` of `ms` fires. */
export function Delayed({ ms }: { ms: number }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return <Text>{ready ? "ready" : "waiting"}</Text>;
}
