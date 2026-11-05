export class AppError extends Error {}
export const boom = () => {
  throw new AppError("boom");
};
