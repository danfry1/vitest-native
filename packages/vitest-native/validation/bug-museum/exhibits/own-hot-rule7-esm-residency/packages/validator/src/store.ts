// Module-level state and a class: the test checks identity through both.
export const store: { value: string | null } = { value: null };
export class Box {
  constructor(public v: number) {}
}
