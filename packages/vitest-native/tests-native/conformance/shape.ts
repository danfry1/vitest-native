/**
 * Comparing a value with a declared shape (scripts/conformance/extract-contract.mjs): the
 * pure part of the conformance probe (probe.tsx), with no React Native, so a unit test
 * covers it (tests/conformance-shape.test.ts).
 */
export interface Shape {
  kind: string;
  type?: string;
  optional?: boolean;
  members?: Record<string, Shape>;
}
export interface ExportContract extends Shape {
  parameters?: (Shape & { name: string })[];
  returns?: Shape;
  /** What the export's other overloads return; a result may match any of them. */
  alsoReturns?: Shape[];
}
export interface Contract {
  package: string;
  version: string;
  exports: Record<string, ExportContract>;
}
/** Why `value` does not have `shape` at `path`: one line per difference. */
export function differences(value: unknown, shape: Shape, path: string): string[] {
  if (["unchecked", "void", "undefined", "never", "null"].includes(shape.kind)) return [];
  if (value === undefined || value === null) {
    return shape.optional ? [] : [`${path}: is ${value}, declared ${describeShape(shape)}`];
  }
  const actual = typeof value;
  switch (shape.kind) {
    case "number":
    case "string":
    case "boolean":
    case "bigint":
    case "symbol":
      return actual === shape.kind ? [] : [`${path}: is ${actual}, declared ${shape.kind}`];
    case "array":
      return Array.isArray(value) ? [] : [`${path}: is ${actual}, declared array`];
    case "function":
    case "object": {
      if (shape.kind === "function") {
        // A component may be an exotic object (forwardRef, memo), which React renders as one.
        const component = actual === "object" && "$$typeof" in (value as object);
        if (actual !== "function" && !component) {
          return [`${path}: is ${actual}, declared function`];
        }
      } else if (actual !== "object" && actual !== "function") {
        return [`${path}: is ${actual}, declared ${describeShape(shape)}`];
      }
      const found: string[] = [];
      for (const [name, member] of Object.entries(shape.members ?? {})) {
        const here = `${path}.${name}`;
        // Present if `in` finds it or a read gives a value: a Proxy that answers any read
        // (bottom-sheet's internal hooks) has no `has` trap, so `in` alone says missing.
        const read = readMember(value as Record<string, unknown>, name);
        if (read === THREW || (!(name in (value as object)) && read === undefined)) {
          // A member declared `never` (a type-level brand) cannot exist at runtime.
          if (!member.optional && member.kind !== "never")
            found.push(`${here}: missing, declared ${describeShape(member)}`);
          continue;
        }
        found.push(...differences(read, member, here));
      }
      return found;
    }
    default:
      return [];
  }
}

/** What readMember gives when the read throws: such a member counts as missing. */
const THREW = Symbol("threw");

/** A member's value, or THREW when reading it throws (a getter that throws). */
function readMember(value: Record<string, unknown>, name: string): unknown {
  try {
    return value[name];
  } catch {
    return THREW;
  }
}

/** Members `value` has beyond `shape`'s, by path (informational). */
export function extras(value: unknown, shape: Shape | undefined, path: string): string[] {
  if (!shape?.members || value === null || typeof value !== "object") return [];
  // A numeric key is a TypeScript enum's reverse mapping, which no declaration lists.
  return Object.keys(value as object)
    .filter((name) => !(name in shape.members!) && !/^\d+$/.test(name))
    .map((name) => `${path}.${name}`);
}

export function describeShape(shape: Shape): string {
  return shape.type ? `${shape.kind} ${shape.type}` : shape.kind;
}
