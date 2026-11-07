import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import Yesly, { SignatureVerificationError, constructEvent, generateTestHeader } from "../dist/index.js";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", object: "event", type: "appointment.confirmed", data: { appointment: { id: "apt_1" } } });
const now = 1794474252;
const sign = (s, t = now, payload = body) => createHmac("sha256", s).update(`${t}.${payload}`).digest("hex");

test("accepts a valid signature and returns the event", () => {
  const ev = constructEvent(body, `t=${now},v1=${sign(secret)}`, secret, { now });
  assert.equal(ev.type, "appointment.confirmed");
  assert.equal(Yesly.webhooks.constructEvent(Buffer.from(body), `t=${now},v1=${sign(secret)}`, secret, { now }).id, "evt_1");
});

test("accepts either signature during a secret roll", () => {
  assert.ok(constructEvent(body, `t=${now},v1=${sign("whsec_old")},v1=${sign(secret)}`, secret, { now }));
});

test("rejects a tampered body, a wrong secret, an old timestamp and a bad header", () => {
  const h = `t=${now},v1=${sign(secret)}`;
  assert.throws(() => constructEvent(body + " ", h, secret, { now }), SignatureVerificationError);
  assert.throws(() => constructEvent(body, h, "whsec_other", { now }), SignatureVerificationError);
  assert.throws(() => constructEvent(body, h, secret, { now: now + 301 }), /tolerance/);
  assert.ok(constructEvent(body, h, secret, { now: now + 301, tolerance: 0 }));
  assert.throws(() => constructEvent(body, "nonsense", secret, { now }), /malformed/);
  assert.throws(() => constructEvent(body, undefined, secret, { now }), /missing/);
});

test("generateTestHeader produces what the API sends", () => {
  assert.equal(generateTestHeader(body, secret, now), `t=${now},v1=${sign(secret)}`);
});
