export class AuctionError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = status === 401
      ? "SESSION_EXPIRED"
      : status === 403
        ? "FORBIDDEN"
        : status === 429
          ? "RATE_LIMITED"
          : "OPERATION_REJECTED",
  ) {
    super(message);
    this.name = "AuctionError";
  }
}
