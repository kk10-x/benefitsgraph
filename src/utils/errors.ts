export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const NotFoundError = (resource: string) => new ApiError(404, "NOT_FOUND", `${resource} not found`);
export const ConflictError = (message: string) => new ApiError(409, "CONFLICT", message);
export const BadRequestError = (message: string) => new ApiError(400, "BAD_REQUEST", message);
