/**
 * The small regex language Jest path patterns are written in — literals, escapes,
 * groups, alternation, `?` and `.*` — expanded into every string it matches, with
 * `.*` kept as STAR. Anything else (classes, `+`, `{n}`, anchors inside) throws, so
 * callers report the pattern instead of approximating it.
 */
export const STAR = "\0";
const MAX_EXPANSIONS = 256;

export class Unparseable extends Error {}

/**
 * @param literalDot read an unescaped `.` as a literal dot. Right for package names
 *   and module specifiers, where it never means "any character"; wrong for path
 *   patterns, where it throws instead.
 */
export function expandRegex(source: string, literalDot: boolean): string[] {
  let i = 0;
  const alternation = (): string[] => {
    const out = [...sequence()];
    while (source[i] === "|") {
      i++;
      out.push(...sequence());
    }
    return out;
  };
  const sequence = (): string[] => {
    let acc = [""];
    while (i < source.length && source[i] !== "|" && source[i] !== ")") {
      let atom: string[];
      const c = source[i];
      if (c === "(") {
        i++;
        if (source.startsWith("?:", i)) i += 2;
        else if (source[i] === "?") throw new Unparseable();
        atom = alternation();
        if (source[i] !== ")") throw new Unparseable();
        i++;
      } else if (c === "\\") {
        const next = source[i + 1];
        // \d, \w, \b and friends are classes, not escaped literals.
        if (next === undefined || /[A-Za-z0-9]/.test(next)) throw new Unparseable();
        atom = [next];
        i += 2;
      } else if (c === ".") {
        i++;
        if (source[i] === "*") {
          i++;
          atom = [STAR];
        } else if (literalDot) {
          atom = ["."];
        } else {
          throw new Unparseable();
        }
      } else if ("[]{}+*^$".includes(c)) {
        throw new Unparseable();
      } else {
        atom = [c];
        i++;
      }
      if (source[i] === "?") {
        i++;
        atom = ["", ...atom];
      }
      const next: string[] = [];
      for (const a of acc) for (const b of atom) next.push(a + b);
      if (next.length > MAX_EXPANSIONS) throw new Unparseable();
      acc = next;
    }
    return acc;
  };
  const result = alternation();
  if (i !== source.length) throw new Unparseable();
  return result;
}

/** expandRegex, or null when the source is outside the language. */
export function tryExpand(source: string, literalDot: boolean): string[] | null {
  try {
    return expandRegex(source, literalDot);
  } catch (error) {
    if (error instanceof Unparseable) return null;
    throw error;
  }
}
