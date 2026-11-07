import { createHmac, timingSafeEqual } from "node:crypto";
import { SignatureVerificationError } from "./errors.js";
import type { Event } from "./generated/types.js";

/** Seconds a delivery's timestamp may differ from the local clock. */
export const DEFAULT_TOLERANCE = 300;

export interface VerifyOptions {
  /** Seconds; 0 turns the check off. Default 300. */
  tolerance?: number;
  /** Current Unix time in seconds, for tests. */
  now?: number;
}

/**
 * Checks a delivery's `Yesly-Signature` header against the raw body and the
 * endpoint's signing secret (`whsec_…`). Throws `SignatureVerificationError`
 * when it does not match or the timestamp is too far from now.
 */
export function verifySignature(payload: string | Uint8Array, header: string | null | undefined, secret: string, options: VerifyOptions = {}): void {
  if (!header) throw new SignatureVerificationError("The Yesly-Signature header is missing.");
  let t: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t") t = Number(value);
    else if (key === "v1") signatures.push(value);
  }
  if (t === undefined || !Number.isFinite(t) || signatures.length === 0) {
    throw new SignatureVerificationError("The Yesly-Signature header is malformed.");
  }
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - t) > tolerance) {
    throw new SignatureVerificationError("The Yesly-Signature timestamp is outside the tolerance.");
  }
  const body = typeof payload === "string" ? Buffer.from(payload, "utf8") : Buffer.from(payload);
  const expected = createHmac("sha256", secret).update(`${t}.`).update(body).digest();
  const ok = signatures.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new SignatureVerificationError("No signature in Yesly-Signature matches the payload.");
}

/** Verifies a delivery and returns its event. Pass the raw body, before any JSON parsing. */
export function constructEvent(payload: string | Uint8Array, header: string | null | undefined, secret: string, options: VerifyOptions = {}): Event {
  verifySignature(payload, header, secret, options);
  const text = typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8");
  return JSON.parse(text) as Event;
}

/** Builds a `Yesly-Signature` value, to test your own webhook handler. */
export function generateTestHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export const webhooks = { constructEvent, verifySignature, generateTestHeader };
