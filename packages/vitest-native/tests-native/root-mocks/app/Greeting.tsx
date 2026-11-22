import React from "react";
import { Banner } from "rn-ecosystem-lib";

export function Greeting({ name }: { name: string }) {
  return <Banner label={name} />;
}
