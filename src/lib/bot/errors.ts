export class BotApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'BotApiError';
    this.status = status;
    this.details = details;
  }
}
