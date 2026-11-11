import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Yesly, { API_VERSION, AuthenticationError, ConflictError, InvalidRequestError, APIConnectionError, VERSION } from "../dist/index.js";
import { fakeFetch } from "./helpers.mjs";

const cnv = { id: "cnv_7Qp4Ns2Xk9Lm3D", object: "conversation", status: "scheduled" };
const client = (f, o = {}) => new Yesly("ysk_test_123", { fetch: f, baseUrl: "https://api.test/v1", ...o });

test("creates a conversation with the right request", async () => {
  const f = fakeFetch([201, cnv]);
  const out = await client(f).conversations.create({
    agent: "agt_8Hd2kQ4mZ1LpXy",
    contact: { external_id: "customer-3391", phone: "+34600000001", name: "Marta" },
    channels: ["whatsapp", "call"],
    context: { order: "8841" },
  });
  assert.deepEqual(out, cnv);
  const [c] = f.calls;
  assert.equal(c.method, "POST");
  assert.equal(c.url.href, "https://api.test/v1/conversations");
  assert.equal(c.headers.Authorization, "Bearer ysk_test_123");
  assert.equal(c.headers["Yesly-Version"], API_VERSION);
  assert.match(c.headers["User-Agent"], /^yesly-node\/0\.2\.0 /);
  assert.match(c.headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
  assert.equal(c.body.contact.phone, "+34600000001");
  assert.deepEqual(c.body.channels, ["whatsapp", "call"]);
});

test("encodes path ids and query parameters", async () => {
  const f = fakeFetch([200, cnv], [200, { object: "list", url: "/v1/conversations", has_more: false, data: [] }], [200, { id: "mem_1", deleted: true }]);
  const y = client(f);
  await y.conversations.retrieve("cnv/1");
  await y.conversations.list({ status: "no_reply", agent: "agt_8Hd2kQ4mZ1LpXy", limit: 5, to: undefined });
  await y.contacts.deleteMemory("ctc_3Kf9Lq2Wm7Rt4B", "mem/1");
  assert.equal(f.calls[0].url.pathname, "/v1/conversations/cnv%2F1");
  assert.equal(f.calls[1].url.search, "?status=no_reply&agent=agt_8Hd2kQ4mZ1LpXy&limit=5");
  assert.equal(f.calls[2].method, "DELETE");
  assert.equal(f.calls[2].url.pathname, "/v1/contacts/ctc_3Kf9Lq2Wm7Rt4B/memory/mem%2F1");
});

test("sends one Idempotency-Key and keeps it across retries", async () => {
  const f = fakeFetch([500, { error: { type: "api_error", message: "boom" } }], [503, {}, { "retry-after": "0" }], [200, { id: "ctc_1" }]);
  await client(f).contacts.create({ external_id: "customer-3391", phone: "+34600000001" });
  assert.equal(f.calls.length, 3);
  const keys = new Set(f.calls.map((c) => c.headers["Idempotency-Key"]));
  assert.equal(keys.size, 1);
  assert.match([...keys][0], /^[0-9a-f-]{36}$/);
});

test("uses the Idempotency-Key it is given", async () => {
  const f = fakeFetch([200, cnv]);
  await client(f).conversations.cancel("cnv_7Qp4Ns2Xk9Lm3D", { idempotencyKey: "cancel-order-8841" });
  assert.equal(f.calls[0].url.pathname, "/v1/conversations/cnv_7Qp4Ns2Xk9Lm3D/cancel");
  assert.equal(f.calls[0].headers["Idempotency-Key"], "cancel-order-8841");
});

test("retries 429 and network errors, then gives up", async () => {
  const f = fakeFetch([429, {}, { "retry-after": "0" }], new TypeError("fetch failed"), new TypeError("fetch failed"));
  await assert.rejects(client(f).balance.retrieve(), APIConnectionError);
  assert.equal(f.calls.length, 3);
});

test("does not retry 4xx and maps the error body", async () => {
  const f = fakeFetch([422, { error: { type: "invalid_request", code: "phone_invalid", param: "contact.phone", message: "Not E.164", request_id: "req_1" } }]);
  const err = await client(f).conversations.create({ agent: "agt_8Hd2kQ4mZ1LpXy", contact: { phone: "6" }, channels: ["call"] }).catch((e) => e);
  assert.ok(err instanceof InvalidRequestError);
  assert.equal(err.code, "phone_invalid");
  assert.equal(err.param, "contact.phone");
  assert.equal(err.requestId, "req_1");
  assert.equal(err.status, 422);
  assert.equal(f.calls.length, 1);
});

test("maps 401 and 409", async () => {
  const f = fakeFetch([401, { error: { type: "authentication_failed", message: "No key" } }], [409, { error: { type: "conflict", code: "conversation_not_cancellable", message: "Already ended" } }]);
  await assert.rejects(client(f).balance.retrieve(), AuthenticationError);
  await assert.rejects(client(f).conversations.cancel("cnv_1"), ConflictError);
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
  const f = fakeFetch([200, { object: "list", url: "/v1/contacts", has_more: true, data: [{ id: "ctc_2" }] }], [200, { object: "list", url: "/v1/contacts", has_more: false, data: [{ id: "ctc_1" }] }]);
  const page = await client(f).contacts.list();
  assert.equal(page.data.length, 1);
  assert.ok(page.hasNextPage());
  const next = await page.nextPage();
  assert.deepEqual(next.data, [{ id: "ctc_1" }]);
  assert.equal(next.hasNextPage(), false);
});

test("reads a conversation's turns, which have no id, in one page", async () => {
  const turn = { object: "turn", role: "contact", channel: "whatsapp", message: "msg_1", text: "Vale", at: "2026-12-01T10:03:41+01:00" };
  const f = fakeFetch([200, { object: "list", url: "/v1/conversations/cnv_1/messages", has_more: false, data: [turn, turn] }]);
  const seen = [];
  for await (const t of client(f).conversations.listMessages("cnv_1")) seen.push(t.text);
  assert.deepEqual(seen, ["Vale", "Vale"]);
  assert.equal(f.calls.length, 1);
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

test("refuses a plain-HTTP base URL except for localhost, and does not follow redirects", async () => {
  assert.throws(() => new Yesly("ysk_test_123", { baseUrl: "http://api.yesly.dev/v1" }), /must use https/);
  assert.throws(() => new Yesly("ysk_test_123", { baseUrl: "not a url" }), /not a valid URL/);
  for (const baseUrl of ["http://localhost:4010", "http://127.0.0.1:4010/v1", "http://[::1]:4010"]) {
    assert.equal(new Yesly("ysk_test_123", { baseUrl }).baseUrl, baseUrl);
  }
  const f = fakeFetch([200, {}]);
  await client(f).balance.retrieve();
  assert.equal(f.calls[0].redirect, "manual");
});
