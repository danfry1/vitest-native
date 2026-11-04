// No test loads this file: it is in the report only through `coverage.include`.
export function untested(flag: boolean): string {
  return flag ? "yes" : "no";
}
