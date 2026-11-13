// The landing page's "How it's checked" numbers, read at build time from the files they
// describe, so the page cannot state a count its sources do not hold.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/vitest-native')
const FIDELITY = path.resolve(PACKAGE, '../../website/guide/fidelity.md')
const EXHIBITS = path.join(PACKAGE, 'validation/bug-museum/exhibits.json')
const RN_TESTS = path.join(PACKAGE, 'tests/rn-conformance')

export interface CrossCheck {
  probesMatching: number
  probes: number
  reactNative: string
  apisReached: number
  apis: number
  componentsReached: number
  components: number
}

/** The summary of the generated fidelity report (`bun run fidelity:report`). */
export function crossCheck(report: string = fs.readFileSync(FIDELITY, 'utf8')): CrossCheck {
  const probes = /\*\*(\d+) \/ (\d+) probes\*\* match between the mock engine and real React Native/.exec(report)
  const range = /across \*\*React Native (\d+\.\d+–\d+\.\d+)\*\*/.exec(report)
  const reach = /reaches (\d+) of (\d+) mocked APIs and (\d+) of (\d+) mocked components/.exec(report)
  if (!probes || !range || !reach) throw new Error('the fidelity report no longer has the summary proof.ts reads')
  return {
    probesMatching: Number(probes[1]),
    probes: Number(probes[2]),
    reactNative: range[1],
    apisReached: Number(reach[1]),
    apis: Number(reach[2]),
    componentsReached: Number(reach[3]),
    components: Number(reach[4]),
  }
}

export interface Museum {
  exhibits: number
  /** Fails on a build that has the bug and passes on one without it (fix, guard or landed). */
  proven: number
  /** Open bugs: fail on main as their bug, and pass with its precondition removed. */
  open: number
}

const PROVEN = new Set(['landed proven', 'guard proven', 'fix proven'])

export function museum(
  file: { exhibits: { status?: { proof?: string } }[] } = JSON.parse(fs.readFileSync(EXHIBITS, 'utf8')),
): Museum {
  const proofs = file.exhibits.map((exhibit) => exhibit.status?.proof)
  return {
    exhibits: proofs.length,
    proven: proofs.filter((proof) => proof !== undefined && PROVEN.has(proof)).length,
    open: proofs.filter((proof) => proof === 'open (control passes)').length,
  }
}

export interface PortedTests {
  tests: number
  skipped: number
  areas: string[]
}

/** Tests are `it(...)` / `it.skip(...)` calls, one per line, in tests/rn-conformance. */
export function portedTests(dir: string = RN_TESTS): PortedTests {
  const files = fs.readdirSync(dir).filter((file) => /^rn-.+\.test\.tsx?$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  let tests = 0
  let skipped = 0
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const call = /^\s*(?:it|test)(\.skip)?\(/.exec(line)
      if (!call) continue
      tests++
      if (call[1]) skipped++
    }
  }
  return { tests, skipped, areas: files.map((file) => file.replace(/^rn-|\.test\.tsx?$/g, '')) }
}

export function proof() {
  return { crossCheck: crossCheck(), museum: museum(), ported: portedTests() }
}
