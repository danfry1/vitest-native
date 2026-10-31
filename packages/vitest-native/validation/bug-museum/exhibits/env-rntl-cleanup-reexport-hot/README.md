# Under hot with globals: false, cleanup is skipped when RNTL is re-exported by a package

- **Class:** env-contract
- **Source:** #342 adversarial review
- **Fixed by:** #342 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

Apps often re-export RNTL from a test-utils package (render with providers). #342's first version tracked RNTL imports only through Vite's evaluator, so under the hot runtime with globals: false an RNTL loaded by an externalized node_modules package was never seen and its auto-cleanup was SKIPPED (on main there is no cleanup at all with globals: false, #17).

## Expected behaviour

With RNTL reached through an installed test-utils package, each test's tree is unmounted after the test.
