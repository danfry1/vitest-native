import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

// Default configuration on purpose. The probe's question is what a user gets with
// no configuration at all, so anything that needs a `transform:` entry or a manual
// mock to pass here is a finding, not something to work around in this file.
export default defineConfig({ plugins: [reactNative()] })
