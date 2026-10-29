// A package's own source, which its files require by the package's name (Node's
// self-reference), while an installed copy of the same name exists at the package root.
export const state: { value: string | null } = { value: null };
