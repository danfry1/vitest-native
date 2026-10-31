import fs from "node:fs";
import React, { useId } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

function Label() {
  const id = useId();
  return <Text testID="label" nativeID={id}>{id}</Text>;
}

// Under Jest (and stock isolation) every file renders in a fresh React, so the first id a
// file sees does not depend on the files before it. Each file records its first id; a
// later file in the worker must see the same one. (The id's format is React's own.)
test("a file's first useId does not depend on the files before it", async () => {
  await render(<Label />);
  const id = screen.getByTestId("label").props.nativeID;
  const log = ".museum-first-ids.json";
  const seen: string[] = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, "utf8")) : [];
  fs.writeFileSync(log, JSON.stringify([...seen, id]));
  if (seen.length > 0) expect(id, "this file's first useId is the earlier file's first useId").toBe(seen[0]);
});
