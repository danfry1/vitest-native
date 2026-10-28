# Nested Text is not queryable on RNTL 12

- **Class:** presets
- **Source:** monorepo migration report #16
- **Fixed by:** #341 (`origin/fix/screens-header-and-virtual-text`)
- **Needs:** rntl 12

## The bug

RNTL's host-text list is ['Text', 'RCTText']. vitest-native registered RCTVirtualText (the host of a nested <Text>) only for RNTL 14 and documented it as a no-op for RNTL 12/13, though the supported range is 12-14: on RNTL 12 `getByText('inner')` misses the inner span of `<Text>outer <Text>inner</Text></Text>`. Jest's preset hides it (Text is one flat mock host).

## Expected behaviour

`getByText` finds nested text on every supported RNTL.
