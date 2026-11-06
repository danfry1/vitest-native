# A module that does not compile fails without naming where

- **Class:** transform/resolution
- **Source:** Rocket.Chat trial (#579)
- **Fixed by:** #586
- **Needs:** nothing beyond this repository's install

## The bug

A project `.js` file with a legacy decorator (WatermelonDB models), which nothing compiled, failed with only `SyntaxError: Invalid or unexpected token`: no file, no line. In Rocket.Chat, 32 suites failed that way, with no way to find the cause.

## Expected behaviour

The failure names the file and line that did not compile.
