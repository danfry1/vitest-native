// VitePress runs this loader at build time, in Node, and hands its result to the page.
import { PROOF_INPUTS, proof } from './proof.ts'

export default {
  // Paths are relative to this file; a directory is watched with everything in it.
  watch: Object.values(PROOF_INPUTS).map((input) =>
    input.endsWith('.md') || input.endsWith('.json') ? `../../${input}` : `../../${input}/**`,
  ),
  load() {
    return proof()
  },
}
