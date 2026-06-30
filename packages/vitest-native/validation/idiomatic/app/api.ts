// A mock async data layer — resolves on a timer like a real fetch, and can fail.
export type Item = { id: number; name: string };

export function fetchItems(opts: { fail?: boolean } = {}): Promise<Item[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (opts.fail) reject(new Error("network"));
      else resolve([
        { id: 1, name: "Alpha" },
        { id: 2, name: "Beta" },
        { id: 3, name: "Gamma" },
      ]);
    }, 20);
  });
}
