---
"vitest-native": patch
---

`doctor` now reports whether the config actually uses the plugin

The config check was a substring test for "vitest-native", so a config whose only
mention was a `// TODO: migrate to vitest-native` comment reported "uses
vitest-native" and "No blocking problems found" — on a project where every React
Native import fails. A config that imports the plugin but never adds it to
`plugins: [...]`, or where the import has been commented out, read the same way.
Diagnosing exactly that is the command's purpose.

The check now reads the import, takes the binding name from it so an aliased import
still counts, and confirms that binding is called. Import forms it does not recognise
are accepted rather than risking a false alarm on a working project.

`vite.config.*` is also recognised now. Vitest reads it when there is no
`vitest.config.*`, but it was missing from the list, so a correct setup was told to
run `vitest-native init` — advice that writes a second config which then takes
precedence over the working one.
