/** Base class of every error this library throws. */
export class YeslyError extends Error {
  /** HTTP status, when the API answered. */
  readonly status?: number;
  /** Error class from the API, such as `invalid_request` or `rate_limited`. */
  readonly type?: string;
  /** Machine-readable reason, such as `phone_invalid`. */
  readonly code?: string;
  /** The parameter at fault, such as `customer.phone`. */
  readonly param?: string;
  /** `Request-Id` of the failed request; include it when you contact support. */
  readonly requestId?: string;
  readonly headers?: Headers;

  constructor(message: string, init: { status?: number; type?: string; code?: string; param?: string; requestId?: string; headers?: Headers; cause?: unknown } = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = new.target.name;
    this.status = init.status;
    this.type = init.type;
    this.code = init.code;
    this.param = init.param;
    this.requestId = init.requestId;
    this.headers = init.headers;
  }
}

/** 400 and other 4xx answers: something in the request needs fixing. */
export class InvalidRequestError extends YeslyError {}
/** 401: missing or revoked API key. */
export class AuthenticationError extends YeslyError {}
/** 403: the key cannot reach this resource, or the IP is not allowed. */
export class PermissionDeniedError extends YeslyError {}
/** 404: no such object in this account and mode. */
export class NotFoundError extends YeslyError {}
/** 409: such as an `external_id` already used with different data. */
export class ConflictError extends YeslyError {}
/** 429: too many requests. Retried automatically before this is thrown. */
export class RateLimitError extends YeslyError {}
/** 5xx: something went wrong on Yesly's side. Retried automatically before this is thrown. */
export class APIError extends YeslyError {}
/** The request did not get an answer: network failure or timeout. */
export class APIConnectionError extends YeslyError {}
/** A webhook delivery whose `Yesly-Signature` does not match, or is too old. */
export class SignatureVerificationError extends YeslyError {}

export function errorFromResponse(status: number, body: unknown, headers: Headers): YeslyError {
  const e = (body as { error?: { type?: string; code?: string; param?: string; message?: string; request_id?: string } } | null)?.error ?? {};
  const init = { status, type: e.type, code: e.code, param: e.param, requestId: e.request_id ?? headers.get("request-id") ?? undefined, headers };
  const message = e.message ?? `The Yesly API answered ${status}.`;
  if (status === 401) return new AuthenticationError(message, init);
  if (status === 403) return new PermissionDeniedError(message, init);
  if (status === 404) return new NotFoundError(message, init);
  if (status === 409) return new ConflictError(message, init);
  if (status === 429) return new RateLimitError(message, init);
  if (status >= 500) return new APIError(message, init);
  return new InvalidRequestError(message, init);
}
