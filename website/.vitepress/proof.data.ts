// VitePress runs this loader at build time, in Node, and hands its result to the page.
import { proof } from './proof.ts'

export default {
  watch: [
    '../guide/fidelity.md',
    '../../packages/vitest-native/validation/bug-museum/exhibits.json',
    '../../packages/vitest-native/tests/rn-conformance/*.test.ts',
  ],
  load() {
    return proof()
  },
}
