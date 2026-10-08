export let FLAG = false;
// Keeps FLAG a live binding the module could reassign, as `export let` usually is.
export function enable(): void {
  FLAG = true;
}
