// Module-level state and a class: one instance per test file, or a write and a read
// disagree and `instanceof` fails.
export const store: { value: string | null } = { value: null };
export class Box {
  constructor(public v: number) {}
}
