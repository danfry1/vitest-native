# Nested Text is not queryable on RNTL 13

- **Class:** presets
- **Source:** migration testing (2026-10)
- **Fixed by:** #341 (merged)
- **Needs:** rntl 13

## The bug

RNTL's host-text list is ['Text', 'RCTText']. vitest-native registered RCTVirtualText (the host of a nested <Text>) only for RNTL 14 and documented it as a no-op for RNTL 12/13, though the supported range is 12-14: on RNTL 13 `getByText('inner')` misses the inner span of `<Text>outer <Text>inner</Text></Text>`. Jest's preset hides it (Text is one flat mock host).

## Expected behaviour

`getByText` finds nested text on every supported RNTL.
