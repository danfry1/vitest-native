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
  if (Array.isArray(value)) {
    return `{${JSON.stringify(value)}}`;
  }
  if (typeof value === "object") {
    return `{${JSON.stringify(value)}}`;
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
        result += "\n" + nextIndentation + printer(child, config, nextIndentation, depth + 1, refs);
      }
    }

    result += `\n${indentation}</${typeName}>`;
    return result;
  },
};
