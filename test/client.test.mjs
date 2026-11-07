import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Yesly, { API_VERSION, AuthenticationError, ConflictError, InvalidRequestError, APIConnectionError, VERSION } from "../dist/index.js";
import { fakeFetch } from "./helpers.mjs";

const apt = { id: "apt_1", object: "appointment", external_id: "ORD-48213" };
const client = (f, o = {}) => new Yesly("ysk_test_123", { fetch: f, baseUrl: "https://api.test/v1", ...o });

test("creates an appointment with the right request", async () => {
  const f = fakeFetch([201, apt]);
  const out = await client(f).appointments.create({
    external_id: "ORD-48213",
    customer: { name: "Martha", phone: "+34600000001" },
    slot: { start: "2026-11-13T09:00:00+01:00" },
  });
  assert.deepEqual(out, apt);
  const [c] = f.calls;
  assert.equal(c.method, "POST");
  assert.equal(c.url.href, "https://api.test/v1/appointments");
  assert.equal(c.headers.Authorization, "Bearer ysk_test_123");
  assert.equal(c.headers["Yesly-Version"], API_VERSION);
  assert.match(c.headers["User-Agent"], /^yesly-node\/0\.1\.0 /);
  assert.equal(c.headers["Idempotency-Key"], undefined, "appointments are idempotent by external_id");
  assert.equal(c.body.customer.phone, "+34600000001");
});

test("encodes path ids and query parameters, metadata included", async () => {
  const f = fakeFetch([200, apt], [200, { object: "list", url: "/v1/appointments", has_more: false, data: [] }]);
  const y = client(f);
  await y.appointments.retrieve("apt/1");
  await y.appointments.list({ status: "no_reply", metadata: { route_id: "BIO-07" }, limit: 5, to: undefined });
  assert.equal(f.calls[0].url.pathname, "/v1/appointments/apt%2F1");
  assert.equal(f.calls[1].url.search, "?status=no_reply&metadata%5Broute_id%5D=BIO-07&limit=5");
});

test("sends one Idempotency-Key and keeps it across retries", async () => {
  const f = fakeFetch([500, { error: { type: "api_error", message: "boom" } }], [503, {}, { "retry-after": "0" }], [200, { object: "list", data: [] }]);
  await client(f).slots.create({ slots: [{ start: "2026-11-13T09:00:00+01:00", type: "delivery" }] });
  assert.equal(f.calls.length, 3);
  const keys = new Set(f.calls.map((c) => c.headers["Idempotency-Key"]));
  assert.equal(keys.size, 1);
  assert.match([...keys][0], /^[0-9a-f-]{36}$/);
});

test("uses the Idempotency-Key it is given", async () => {
  const f = fakeFetch([200, { id: "apt_1" }]);
  await client(f).appointments.cancel("apt_1", { reason: "Shop closed" }, { idempotencyKey: "cancel-apt_1" });
  assert.equal(f.calls[0].headers["Idempotency-Key"], "cancel-apt_1");
  assert.deepEqual(f.calls[0].body, { reason: "Shop closed" });
});

test("retries 429 and network errors, then gives up", async () => {
  const f = fakeFetch([429, {}, { "retry-after": "0" }], new TypeError("fetch failed"), new TypeError("fetch failed"));
  await assert.rejects(client(f).balance.retrieve(), APIConnectionError);
  assert.equal(f.calls.length, 3);
});

test("does not retry 4xx and maps the error body", async () => {
  const f = fakeFetch([400, { error: { type: "invalid_request", code: "phone_invalid", param: "customer.phone", message: "Not E.164", request_id: "req_1" } }]);
  const err = await client(f).appointments.create({ external_id: "x", customer: { phone: "6" }, slot: { start: "2026-11-13T09:00:00+01:00" } }).catch((e) => e);
  assert.ok(err instanceof InvalidRequestError);
  assert.equal(err.code, "phone_invalid");
  assert.equal(err.param, "customer.phone");
  assert.equal(err.requestId, "req_1");
  assert.equal(err.status, 400);
  assert.equal(f.calls.length, 1);
});

test("maps 401 and 409", async () => {
  const f = fakeFetch([401, { error: { type: "authentication_failed", message: "No key" } }], [409, { error: { type: "conflict", code: "external_id_conflict", message: "Different data" } }]);
  await assert.rejects(client(f).balance.retrieve(), AuthenticationError);
  await assert.rejects(client(f).appointments.retrieve("apt_1"), ConflictError);
});

test("walks every page with for await", async () => {
  const page = (ids, more) => [200, { object: "list", url: "/v1/events", has_more: more, data: ids.map((id) => ({ id })) }];
  const f = fakeFetch(page(["evt_3", "evt_2"], true), page(["evt_1"], false));
  const seen = [];
  for await (const e of client(f).events.list({ limit: 2 })) seen.push(e.id);
  assert.deepEqual(seen, ["evt_3", "evt_2", "evt_1"]);
  assert.equal(f.calls[1].url.searchParams.get("starting_after"), "evt_2");
  assert.equal(f.calls[1].url.searchParams.get("limit"), "2");
});

test("awaiting a list gives the first page", async () => {
  const f = fakeFetch([200, { object: "list", url: "/v1/slots", has_more: true, data: [{ id: "slt_1" }] }], [200, { object: "list", url: "/v1/slots", has_more: false, data: [{ id: "slt_0" }] }]);
  const page = await client(f).slots.list();
  assert.equal(page.data.length, 1);
  assert.ok(page.hasNextPage());
  const next = await page.nextPage();
  assert.deepEqual(next.data, [{ id: "slt_0" }]);
  assert.equal(next.hasNextPage(), false);
});

test("reads the key from YESLY_API_KEY and tells the mode", async () => {
  process.env.YESLY_API_KEY = "ysk_live_abc";
  try {
    const f = fakeFetch([200, {}]);
    const y = new Yesly({ fetch: f, baseUrl: "https://api.test/v1" });
    assert.equal(y.mode, "live");
    await y.balance.retrieve();
    assert.equal(f.calls[0].headers.Authorization, "Bearer ysk_live_abc");
  } finally {
    delete process.env.YESLY_API_KEY;
  }
  await assert.rejects(new Yesly({ fetch: fakeFetch() }).balance.retrieve(), /No API key/);
});

test("VERSION matches package.json", () => {
  assert.equal(VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version);
});
