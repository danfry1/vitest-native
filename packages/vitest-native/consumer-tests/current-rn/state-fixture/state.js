const entries = [];
exports.record = (value) => {
  entries.push(value);
};
exports.count = () => entries.length;
