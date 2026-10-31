// Expo's winter runtime as SDK 57 installs it (src/winter/runtime.native.ts and
// installGlobal.ts): a global replaced by a lazy property whose first read requires the
// implementation. Unlike Expo's, this one touches no other global as it installs (Expo's
// reads FormData, which initialises Node's fetch, which reads TextDecoder), so the getter
// is still pending afterwards, as it is wherever Node's fetch was initialised earlier.
function install(name: string, getValue: () => unknown): void {
  const object: Record<string, unknown> = globalThis as never;
  let value: unknown;
  let valueSet = false;
  const setValue = (next: unknown): void => {
    value = next;
    valueSet = true;
    Object.defineProperty(object, name, { value: next, configurable: true, enumerable: true, writable: true });
  };
  Object.defineProperty(object, name, {
    configurable: true,
    enumerable: true,
    set: setValue,
    get() {
      if (!valueSet) {
        valueSet = true;
        setValue(getValue());
      }
      return value;
    },
  });
}

install("TextDecoder", () => require("./TextDecoder").TextDecoder);
