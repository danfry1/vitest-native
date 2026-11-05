module.exports = (fn) => {
  try {
    fn();
  } catch (error) {
    return error instanceof require("./errors").AppError;
  }
  return false;
};
