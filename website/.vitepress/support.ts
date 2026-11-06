// The versions vitest-native supports, as one line for the landing page. Read from the
// package's own startup checks, so the page states what the plugin enforces and cannot
// drift from it.
import { SUPPORTED_NODE } from '../../packages/vitest-native/src/node-range.ts'
import {
  PEER_REQUIREMENTS,
  SUPPORTED_EXPO_SDKS,
  SUPPORTED_REACT_NATIVE,
  expoSdkList,
} from '../../packages/vitest-native/src/peer-requirements.ts'

export interface SupportItem {
  name: string
  versions: string
}

/** `>=22.22.3 <23 || >=24.12.0 <25 || >=26.0.0` as `22.22.3+, 24.12+ or 26+`. */
export function nodeVersions(range: string = SUPPORTED_NODE): string {
  const floors = range.split('||').map((set) => {
    const floor = /(?:^|\s)>=\s*(\d+(?:\.\d+)*)/.exec(set.trim())?.[1]
    if (!floor) throw new Error(`no >= floor in "${set}"`)
    return `${floor.replace(/\.0$/, '').replace(/\.0$/, '')}+`
  })
  return floors.length > 1
    ? `${floors.slice(0, -1).join(', ')} or ${floors[floors.length - 1]}`
    : floors[0]
}

function majorOf(name: string): string {
  const peer = PEER_REQUIREMENTS.find((entry) => entry.name === name)
  if (!peer) throw new Error(`no peer requirement for ${name}`)
  const major = peer.minimum.split('.')[0]
  // A ceiling one above the floor means exactly that major is supported.
  if (peer.maximumMajor !== undefined && peer.maximumMajor !== Number(major) + 1) {
    return `${major}–${peer.maximumMajor - 1}`
  }
  return major
}

export function supportItems(): SupportItem[] {
  const { minimumMinor, maximumMinor } = SUPPORTED_REACT_NATIVE
  return [
    { name: 'React Native', versions: `0.${minimumMinor}–0.${maximumMinor}` },
    { name: 'Expo SDK', versions: expoSdkList('and') },
    { name: 'Vitest', versions: majorOf('vitest') },
    { name: 'Node', versions: nodeVersions() },
  ]
}

// Re-exported so a test can compare the line with the checks it is read from.
export { SUPPORTED_EXPO_SDKS }
