import { randomUUID } from "node:crypto";
import { APIConnectionError, errorFromResponse, YeslyError } from "./errors.js";
import { API_VERSION, BASE_URL } from "./generated/types.js";
import { Page, PagePromise } from "./pagination.js";
import { VERSION } from "./version.js";

export interface ClientOptions {
  /** Defaults to the `YESLY_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.yesly.dev/v1`, or `YESLY_BASE_URL` when set. */
  baseUrl?: string;
  /** `Yesly-Version` sent with every request. Defaults to the version this library was generated for. */
  apiVersion?: string;
  /** Milliseconds per attempt. Default 30 000. */
  timeout?: number;
  /** Retries after a network error, 408, 429 or 5xx. Default 2. */
  maxRetries?: number;
  /** A `fetch` implementation, for tests or proxies. Defaults to the global one. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** For POSTs that take one. Generated once per call when not given, and reused on retries. */
  idempotencyKey?: string;
  timeout?: number;
  maxRetries?: number;
  apiVersion?: string;
  signal?: AbortSignal;
}

export interface RequestSpec {
  method: string;
  path: string;
  query?: object;
  body?: object;
  idempotent?: boolean;
}

const RETRYABLE = (status: number) => status === 408 || status === 429 || status >= 500;

export class Client {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly #apiKey: string | undefined;
  readonly #fetch: typeof fetch;

  constructor(apiKey?: string | ClientOptions, options: ClientOptions = {}) {
    const o = typeof apiKey === "object" ? apiKey : { ...options, apiKey: apiKey ?? options.apiKey };
    this.#apiKey = o.apiKey ?? env("YESLY_API_KEY");
    this.baseUrl = (o.baseUrl ?? env("YESLY_BASE_URL") ?? BASE_URL).replace(/\/+$/, "");
    this.apiVersion = o.apiVersion ?? API_VERSION;
    this.timeout = o.timeout ?? 30_000;
    this.maxRetries = o.maxRetries ?? 2;
    this.#fetch = o.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** `live` or `test`, from the key's prefix. */
  get mode(): "live" | "test" | undefined {
    if (this.#apiKey?.startsWith("ysk_live_")) return "live";
    if (this.#apiKey?.startsWith("ysk_test_")) return "test";
    return undefined;
  }

  async request<T>(spec: RequestSpec, options: RequestOptions = {}): Promise<T> {
    if (!this.#apiKey) throw new YeslyError("No API key. Pass one to new Yesly(…) or set YESLY_API_KEY.");
    const url = this.baseUrl + spec.path + queryString(spec.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "Yesly-Version": options.apiVersion ?? this.apiVersion,
      "User-Agent": `yesly-node/${VERSION} node/${process.versions.node}`,
    };
    let body: string | undefined;
    if (spec.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(spec.body);
    }
    if (spec.idempotent) headers["Idempotency-Key"] = options.idempotencyKey ?? randomUUID();

    const maxRetries = options.maxRetries ?? this.maxRetries;
    const timeout = options.timeout ?? this.timeout;
    for (let attempt = 0; ; attempt++) {
      const signals = [AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])];
      let res: Response;
      try {
        res = await this.#fetch(url, { method: spec.method, headers, body, signal: AbortSignal.any(signals) });
      } catch (cause) {
        if (options.signal?.aborted) throw cause;
        if (attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        const timedOut = (cause as Error)?.name === "TimeoutError";
        throw new APIConnectionError(timedOut ? `The request timed out after ${timeout} ms.` : "Could not reach the Yesly API.", { cause });
      }
      const text = await res.text();
      const json = parse(text);
      if (res.ok) return json as T;
      if (RETRYABLE(res.status) && attempt < maxRetries) {
        await sleep(retryAfter(res.headers) ?? backoff(attempt));
        continue;
      }
      throw errorFromResponse(res.status, json, res.headers);
    }
  }

  list<T extends { id: string }>(spec: RequestSpec, options: RequestOptions = {}): PagePromise<T> {
    const load = (startingAfter?: string): Promise<Page<T>> =>
      this.request<{ url: string; has_more: boolean; data: T[] }>(
        startingAfter ? { ...spec, query: { ...spec.query, starting_after: startingAfter } } : spec,
        options,
      ).then((raw) => new Page<T>(raw, load));
    return new PagePromise<T>(() => load());
  }
}

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] || undefined : undefined;
}

/** `a=1&metadata[k]=v`; undefined and null are left out. */
export function queryString(query?: object): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const x of v) p.append(k, String(x));
    else if (typeof v === "object") for (const [sk, sv] of Object.entries(v)) sv != null && p.append(`${k}[${sk}]`, String(sv));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Milliseconds from `Retry-After`, if it is a number of seconds up to a minute. */
function retryAfter(h: Headers): number | undefined {
  const s = Number(h.get("retry-after"));
  return Number.isFinite(s) && s >= 0 && s <= 60 ? s * 1000 : undefined;
}

function backoff(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base / 2 + Math.random() * (base / 2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
