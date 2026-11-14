# An installed React Native package the app does not declare is loaded twice

- **Class:** ownership
- **Source:** reproducing #351 (#688)
- **Fixed by:** #688's fix (detection reads installed React Native packages the run does not declare)
- **Needs:** react-native-gesture-handler, which this repository installs

## The bug

react-native-gesture-handler is installed (a hoisted dependency) but the app's
`package.json` does not list it. The test imports it, and Node requires it too, as a
library's Jest setup or a `require()` does. Detection reads only what the run declares, so
the package stayed Vite's for the import while Node loaded its own copy: two copies of
every file (the guard reported 140), and `GestureDetector` from the require was not the
imported one. Declaring the package made it one copy.

## Expected behaviour

One copy whether or not the app declares the package: an installed React Native package
is Node's (ADR-0004 rule 5).
