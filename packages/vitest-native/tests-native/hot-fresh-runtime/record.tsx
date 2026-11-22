// What one file saw, kept on `process` (which the hot reset leaves alone) for the next.
import React from "react";
import { Text } from "react-native";
import * as RNTL from "@testing-library/react-native";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

export interface Seen {
  esmReact: unknown;
  cjsReact: unknown;
  render: unknown;
  id: string;
}

function Id() {
  return <Text testID="id">{React.useId()}</Text>;
}

export async function see(): Promise<Seen> {
  // RNTL 14's render is async, RNTL 13's is not: awaiting covers both.
  await RNTL.render(<Id />);
  const id = String(RNTL.screen.getByTestId("id").props.children);
  return {
    esmReact: React,
    cjsReact: req("react"),
    render: RNTL.render,
    id,
  };
}

export const files = ((process as { __vnFreshRuntime?: Seen[] }).__vnFreshRuntime ??= []);
