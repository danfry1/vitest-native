// Jest and Vitest format parametrised titles differently; compare matches these by position.
test.each([[{ a: 1, b: [1, 2] }]])("formats an object %s", () => {});
test.each([[{ a: 1 }]])("pretty-formats %p", () => {});
test.each([{ v: { deep: true } }])("interpolates $v", () => {});
test.each([["a"]])("keeps %% %s", () => {});
