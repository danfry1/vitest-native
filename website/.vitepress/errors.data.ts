// VitePress runs this loader at build time, in Node, and hands its result to the page.
import { errorIndex } from './error-index.ts'

export default {
  watch: ['../guide/errors.md', '../guide/troubleshooting.md'],
  load() {
    return errorIndex()
  },
}
