// VitePress runs this loader at build time, in Node, and hands its result to the page.
import { supportItems } from './support.ts'

export default {
  load() {
    return supportItems()
  },
}
