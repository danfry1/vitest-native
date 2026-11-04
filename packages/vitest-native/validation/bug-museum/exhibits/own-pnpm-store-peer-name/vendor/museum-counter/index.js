// Module-level state: a fresh module in every test file starts at 0.
let count = 0;
exports.next = () => ++count;
