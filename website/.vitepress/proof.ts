// The landing page's "How it's checked" numbers, read at build time from the files they
// describe, so the page cannot state a count its sources do not hold.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The files the cards read, from the repository's root. They are data, not imports, so the
 * site's deploy triggers (tests/site-inputs.test.ts) and the dev server's reloads
 * (proof.data.ts) both take them from here.
 */
export const PROOF_INPUTS = {
  fidelity: 'website/guide/fidelity.md',
  exhibits: 'packages/vitest-native/validation/bug-museum/exhibits.json',
  portedTests: 'packages/vitest-native/tests/rn-conformance',
} as const

const at = (input: string) => path.join(REPO, input)

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
export function crossCheck(report: string = fs.readFileSync(at(PROOF_INPUTS.fidelity), 'utf8')): CrossCheck {
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
  /** Exhibits with a measured verdict, as STATUS.md counts them. */
  measured: number
  /** Fails on a build that has the bug and passes on one without it (fix, guard or landed). */
  proven: number
  /** Open bugs: fail on main as their bug, and pass with the bug's precondition removed. */
  open: number
}

// status.mjs writes `fix proven (bug on buggyRef)` too, and counts by this prefix.
const PROVEN = /^(fix proven|guard proven|landed proven)/

export function museum(
  file: { exhibits: { status?: { proof?: string } }[] } = JSON.parse(
    fs.readFileSync(at(PROOF_INPUTS.exhibits), 'utf8'),
  ),
): Museum {
  const proofs = file.exhibits.flatMap((exhibit) => exhibit.status?.proof ?? [])
  return {
    measured: proofs.length,
    proven: proofs.filter((proof) => PROVEN.test(proof)).length,
    open: proofs.filter((proof) => proof === 'open (control passes)').length,
  }
}

export interface PortedTests {
  tests: number
  skipped: number
  areas: string[]
}

/**
 * The ported tests: Vitest's own count, recorded in counts.json beside them (a loop can
 * declare several tests, so the files cannot be counted by reading them), and their areas
 * from the file names.
 */
export function portedTests(dir: string = at(PROOF_INPUTS.portedTests)): PortedTests {
  const { tests, skipped } = JSON.parse(fs.readFileSync(path.join(dir, 'counts.json'), 'utf8'))
  const areas = fs
    .readdirSync(dir)
    .filter((file) => /^rn-.+\.test\.tsx?$/.test(file))
    .map((file) => file.replace(/^rn-|\.test\.tsx?$/g, ''))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  return { tests, skipped, areas }
}

export function proof() {
  return { crossCheck: crossCheck(), museum: museum(), ported: portedTests() }
}
