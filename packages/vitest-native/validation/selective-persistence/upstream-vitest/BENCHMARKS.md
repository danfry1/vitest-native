# Selective module isolation benchmark

> Historical experiment: these figures validate selective closure reset, but that is
> no longer the React Native target or upstream v1 request. Current full-reset module
> mode results live in `../../module-isolation/README.md`.

**Date:** 2026-08-28
**Machine:** Darwin arm64, Node 24.13.0
**Shape:** one worker, generated files, three interleaved repetitions per mode

The resident module performs deterministic initialization work. Every test imports a
consumer and asserts that the resident actual evaluated once. Full and selective
isolation also assert that the consumer receives a fresh identity per file. Peak RSS
is sampled for the Vitest process and all descendants every 25 ms.

## Patched Vitest main

Vitest commit `1c00c94686ff6f96ec756503ed765b31068692a8`, using
`moduleIsolation.preserveActual` from `vitest-main-prototype.patch`:

| Files | Mode           |    Median |  Peak RSS | Versus full isolation |    Versus shared |
| ----: | -------------- | --------: | --------: | --------------------: | ---------------: |
|   100 | full isolation |  5,430 ms | 206.7 MiB |              baseline |                — |
|   100 | selective      |    389 ms | 211.8 MiB |          14.0× faster |  +1 ms, +2.3 MiB |
|   100 | shared         |    388 ms | 209.5 MiB |                     — |         baseline |
|   500 | full isolation | 26,548 ms | 249.5 MiB |              baseline |                — |
|   500 | selective      |    894 ms | 283.7 MiB |          29.7× faster | +32 ms, +4.9 MiB |
|   500 | shared         |    862 ms | 278.8 MiB |                     — |         baseline |

Observations were 5,488/5,422/5,430 ms, 387/389/390 ms and 388/389/388 ms at
100 files; and 26,461/26,548/26,582 ms, 918/894/890 ms and 840/942/862 ms at
500 files for full, selective and shared respectively.

## Released Vitest reproduction

Vitest 4.1.10, using the private-runner equivalent:

| Files | Mode           |    Median |  Peak RSS | Versus full isolation |    Versus shared |
| ----: | -------------- | --------: | --------: | --------------------: | ---------------: |
|   100 | full isolation |  6,092 ms | 206.2 MiB |              baseline |                — |
|   100 | selective      |    393 ms | 214.8 MiB |          15.5× faster |  +4 ms, +2.6 MiB |
|   100 | shared         |    389 ms | 212.2 MiB |                     — |         baseline |
|   500 | full isolation | 29,889 ms | 249.4 MiB |              baseline |                — |
|   500 | selective      |    890 ms | 276.6 MiB |          33.6× faster | +47 ms, +4.0 MiB |
|   500 | shared         |    843 ms | 272.6 MiB |                     — |         baseline |

The important result is not the synthetic absolute speedup. It is that selective
reset tracks fully shared execution closely while retaining the consumer-reset and
mock-reset contracts that shared execution fails.
