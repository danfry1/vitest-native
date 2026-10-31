# A nested Text link is not findable by role on RNTL 12

- **Class:** presets
- **Source:** #341 adversarial review
- **Fixed by:** open (#341 documents it as out of scope)
- **Needs:** rntl 12

## The bug

#341 makes nested Text (RCTVirtualText) a text host on RNTL 12/13, which fixes getByText. RNTL 12's `isAccessibilityElement` compares the host's name with the Text host name directly, so a nested `<Text accessibilityRole="link">` is still not an accessibility element and `getByRole('link')` misses it. Jest's preset hides it (one flat Text host).

## Expected behaviour

On RNTL 12, `getByRole('link', { name: 'docs' })` finds a nested Text link, as on RNTL 14 and on a device.
