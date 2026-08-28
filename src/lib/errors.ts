export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "BAD_REQUEST",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Err = {
  unauthorized: (m = "Sign in to continue.") => new AppError(m, 401, "UNAUTHORIZED"),
  forbidden: (m = "You do not have access to this.") => new AppError(m, 403, "FORBIDDEN"),
  notFound: (m = "Not found.") => new AppError(m, 404, "NOT_FOUND"),
  conflict: (m = "That conflicts with an existing record.") => new AppError(m, 409, "CONFLICT"),
  rateLimited: (m = "Too many requests. Try again shortly.") => new AppError(m, 429, "RATE_LIMITED"),
  invalid: (m = "Check the form and try again.", details?: unknown) =>
    new AppError(m, 422, "VALIDATION_ERROR", details),
  server: (m = "Something went wrong on our side.") => new AppError(m, 500, "SERVER_ERROR"),
};
