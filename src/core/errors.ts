import type { ErrorCode, EmpxErrorJSON } from "../types.js";

/** Structured error class — machine-readable for AI agents. */
export class EmpxError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly context: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, retryable = false, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "EmpxError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
  }

  toJSON(): EmpxErrorJSON {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        context: this.context,
      },
    };
  }
}
