// @flow
// Flow source: React Native's preset strips it, Oxc cannot parse it.
export function total(prices: Array<number>): number {
  return prices.reduce((sum, price) => sum + price, 0);
}
