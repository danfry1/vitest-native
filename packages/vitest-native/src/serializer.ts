/**
 * Vitest snapshot serializer for React Native components.
 *
 * Produces clean JSX-like output from React test renderer instances
 * instead of raw createElement objects.
 *
 * Usage: expect.addSnapshotSerializer(serializer)
 */

/** Props that are React internals and should be omitted from snapshot output. */
const INTERNAL_PROPS = new Set([
  "__reactFiber",
  "__reactInternalInstance",
  "__reactEvents",
  "_owner",
  "_store",
  "_self",
  "_source",
  "ref",
  "key",
]);

/** Returns true if `key` starts with any of the internal prefixes. */
function isInternalProp(key: string): boolean {
  if (INTERNAL_PROPS.has(key)) return true;
  if (key.startsWith("__reactFiber$")) return true;
  if (key.startsWith("__reactInternalInstance$")) return true;
  if (key.startsWith("__reactEvents$")) return true;
  if (key.startsWith("__reactProps$")) return true;
  return false;
}

/**
 * Resolve the display name of a component type.
 * Handles strings ("View"), functions (named or anonymous), and forwardRef/memo wrappers.
 */
function getTypeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    return (type as any).displayName || (type as any).name || "Unknown";
  }
  if (typeof type === "object" && type !== null) {
    // forwardRef: { $$typeof: Symbol(react.forward_ref), render: fn }
    const obj = type as any;
    if (obj.displayName) return obj.displayName;
    if (obj.render) {
      return obj.render.displayName || obj.render.name || "ForwardRef";
    }
    if (obj.type) {
      return getTypeName(obj.type);
    }
  }
  return "Unknown";
}

/**
 * JSON-ish rendering of a prop value, for the cases `JSON.stringify` gets wrong here.
 *
 * - Cycles print as `"[Circular]"` instead of throwing. A prop holding a navigation
 *   object, a store, or anything with a parent back-reference made the serializer
 *   raise `Converting circular structure to JSON`, which fails the test with a
 *   TypeError instead of producing a snapshot.
 * - Object keys are sorted, so two structurally equal props serialize identically.
 *   Unsorted, `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produced different snapshots and
 *   churned on a rewrite that changed nothing. Prop KEYS were already sorted below;
 *   this extends the same rule inside values. Arrays keep their order, which is
 *   meaningful.
 * - Functions and `undefined` are rendered rather than dropped. `JSON.stringify`
 *   silently removes them, so `{ onPress: fn }` printed as `{}` — an empty object
 *   that reads like missing data.
 */
function stableStringify(value: unknown, seen: Set<object> = new Set()): string {
  if (value === null) return "null";
  if (typeof value === "function") return `"[Function ${value.name || "anonymous"}]"`;
  if (typeof value === "undefined") return `"[undefined]"`;
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";

  const obj = value as object;
  if (seen.has(obj)) return `"[Circular]"`;
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      return `[${obj.map((entry) => stableStringify(entry, seen)).join(",")}]`;
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify((obj as any)[key], seen)}`)
      .join(",");
    return `{${body}}`;
  } finally {
    seen.delete(obj);
  }
}

/**
 * Format a single prop value for snapshot display.
 */
function formatPropValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `{${String(value)}}`;
  }
  if (typeof value === "function") {
    const name = (value as any).name || "anonymous";
    return `{[Function ${name}]}`;
  }
  if (value === null) {
    return "{null}";
  }
  if (value === undefined) {
    return "{undefined}";
  }
  if (Array.isArray(value) || typeof value === "object") {
    return `{${stableStringify(value)}}`;
  }
  return `{${String(value)}}`;
}

/**
 * Determine whether a value looks like a React test instance (from react-test-renderer
 * or @testing-library/react-native).
 */
function isReactTestInstance(val: unknown): boolean {
  if (val == null || typeof val !== "object") return false;
  const obj = val as any;
  // React test renderer instances have type + props + children
  if ("type" in obj && "props" in obj && "children" in obj) {
    return true;
  }
  // Also match plain React element shape ($$typeof + type + props)
  if (obj.$$typeof && "type" in obj && "props" in obj) {
    return true;
  }
  return false;
}

export interface SnapshotSerializer {
  serialize(
    val: any,
    config: any,
    indentation: string,
    depth: number,
    refs: any[],
    printer: Function,
  ): string;
  test(val: any): boolean;
}

export const serializer: SnapshotSerializer = {
  test(val: unknown): boolean {
    return isReactTestInstance(val);
  },

  serialize(
    val: any,
    config: any,
    indentation: string,
    depth: number,
    refs: any[],
    printer: Function,
  ): string {
    const maxDepth: number = config.maxDepth ?? 10;
    if (depth > maxDepth) {
      return `${indentation}<...>`;
    }

    const typeName = getTypeName(val.type);
    const nextIndentation = indentation + (config.indent ?? "  ");

    // Collect visible props
    const props = val.props ?? {};
    const propKeys = Object.keys(props).filter((key) => key !== "children" && !isInternalProp(key));

    // Resolve children — may come from val.children or val.props.children
    let children: any[] = [];
    if (Array.isArray(val.children)) {
      children = val.children.filter((c: unknown) => c != null);
    } else if (val.children != null) {
      children = [val.children];
    } else if (props.children != null) {
      if (Array.isArray(props.children)) {
        children = props.children.filter((c: unknown) => c != null);
      } else {
        children = [props.children];
      }
    }

    // Build opening tag
    let result = `${indentation}<${typeName}`;

    // Add props
    if (propKeys.length > 0) {
      for (const key of propKeys.sort()) {
        const value = props[key];
        if (typeof value === "boolean" && value === true) {
          result += `\n${nextIndentation}${key}`;
        } else {
          result += `\n${nextIndentation}${key}=${formatPropValue(value)}`;
        }
      }
    }

    // Self-closing if no children
    if (children.length === 0) {
      if (propKeys.length > 0) {
        result += `\n${indentation}/>`;
      } else {
        result += " />";
      }
      return result;
    }

    // Single string child — render inline: <Text>Hello</Text>
    if (children.length === 1 && typeof children[0] === "string") {
      if (propKeys.length > 0) {
        result += `\n${indentation}>`;
      } else {
        result += ">";
      }
      result += `\n${nextIndentation}${children[0]}`;
      result += `\n${indentation}</${typeName}>`;
      return result;
    }

    // Multiple or complex children
    if (propKeys.length > 0) {
      result += `\n${indentation}>`;
    } else {
      result += ">";
    }

    for (const child of children) {
      if (child == null) continue;

      if (typeof child === "string") {
        result += `\n${nextIndentation}${child}`;
      } else if (typeof child === "number") {
        result += `\n${nextIndentation}${String(child)}`;
      } else if (isReactTestInstance(child)) {
        result += "\n" + printer(child, config, nextIndentation, depth + 1, refs);
      } else {
        // Fallback: use printer for anything else
        result += "\n" + printer(child, config, nextIndentation, depth + 1, refs);
      }
    }

    result += `\n${indentation}</${typeName}>`;
    return result;
  },
};
