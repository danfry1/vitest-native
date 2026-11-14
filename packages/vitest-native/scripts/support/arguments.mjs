/**
 * The command-line arguments of the repository's scripts, read strictly: an argument a
 * script does not read stops it before it does anything.
 *
 * Reading `process.argv` with indexOf/includes ignores whatever it does not look for. The
 * bug museum's runner was given `--build <dir>` as one word (a shell variable zsh does not
 * split), kept its default build, and a run meant for main measured the current checkout
 * with nothing to say so.
 */

export class ArgumentError extends Error {}

/**
 * `valued` flags take the next word as their value; `flags` take none. `positionals` is how
 * many bare words the script takes. Returns `{ values, positionals }`: a valued flag's
 * value, `true` for a flag, `undefined` for one not given.
 */
export function parseArguments(args, { script, valued = [], flags = [], positionals = 0 }) {
  const known = [...valued, ...flags].map((name) => `--${name}`).join(", ");
  const fail = (message) => new ArgumentError(`${script}: ${message}`);
  const values = {};
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name !== null && (valued.includes(name) || flags.includes(name))) {
      if (name in values) throw fail(`--${name} is given twice`);
      if (flags.includes(name)) {
        values[name] = true;
        continue;
      }
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) throw fail(`--${name} needs a value`);
      values[name] = value;
      i++;
      continue;
    }
    if (!arg.startsWith("-") && words.length < positionals) {
      words.push(arg);
      continue;
    }
    throw fail(
      `unknown argument ${JSON.stringify(arg)} (${known ? `flags: ${known}; ` : ""}a flag and its value are separate words)`,
    );
  }
  return { values, positionals: words };
}

/** parseArguments on this process's arguments; a bad one prints why, and the usage, and exits 2. */
export function cliArguments(spec, usage) {
  try {
    return parseArguments(process.argv.slice(2), spec);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    console.error(error.message);
    if (usage) console.error(`usage: ${usage}`);
    process.exit(2);
  }
}
