# yesly-node

The official Node.js library for the Yesly API.

> Status: 0.1.0, not published yet. Covers API version `2026-10-01`.

## Install

```bash
npm install @yesly/node
```

Node.js 20.19 or later. ESM, with TypeScript types; no runtime dependencies.

## Usage

```js
import Yesly from "@yesly/node";

const yesly = new Yesly(process.env.YESLY_API_KEY);

await yesly.appointments.create({
  external_id: "ORD-48213",
  type: "delivery",
  customer: { name: "Martha", phone: "+34612345678" },
  slot: { start: "2026-11-13T09:00:00+01:00", end: "2026-11-13T11:00:00+01:00" },
  metadata: { order_id: "PV-18342", route_id: "BIO-07" },
});
```

The key defaults to `YESLY_API_KEY`. Every resource of the API reference is a
property of the client: `appointments`, `imports`, `slots`, `appointmentTypes`,
`locations`, `webhookEndpoints`, `events`, `balance` and `analytics`. Requests
and responses keep the API's field names (`external_id`), with types for each.

## Webhooks

Verify each delivery with the endpoint's signing secret, over the raw body:

```js
app.post("/yesly/webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = yesly.webhooks.constructEvent(req.body, req.get("Yesly-Signature"), process.env.YESLY_WEBHOOK_SECRET);
  } catch {
    return res.sendStatus(400);
  }
  if (event.type === "appointment.confirmed") {
    const { external_id } = event.data.appointment;
  }
  res.json({ received: true });
});
```

`constructEvent` rejects deliveries more than five minutes old and accepts
either signature during a secret roll. `Yesly.webhooks` works without an API
key, and `generateTestHeader` signs a payload to test your handler.

## Lists

`await` a list for one page, or iterate it to walk every page:

```js
const page = await yesly.events.list({ limit: 50 });
page.data; page.has_more; await page.nextPage();

for await (const apt of yesly.appointments.list({ status: "no_reply", metadata: { route_id: "BIO-07" } })) {
  console.log(apt.external_id);
}
```

## Errors

Failed requests throw a `YeslyError` subclass: `InvalidRequestError` (400, 422),
`AuthenticationError` (401), `PermissionDeniedError` (403), `NotFoundError`
(404), `ConflictError` (409), `RateLimitError` (429), `APIError` (5xx) or
`APIConnectionError` (no answer). Each has `status`, `type`, `code`, `param`
and `requestId`.

```js
try {
  await yesly.appointments.create({ … });
} catch (e) {
  if (e instanceof InvalidRequestError && e.code === "phone_invalid") { … }
}
```

## Retries, timeouts and idempotency

Network errors, timeouts, 408, 429 and 5xx are retried twice with backoff,
honouring `Retry-After`. POSTs that take an `Idempotency-Key` get one per call,
reused on every retry; pass your own with `{ idempotencyKey }`. Creating an
appointment is idempotent by `external_id` instead.

```js
new Yesly({ apiKey, timeout: 10_000, maxRetries: 4 });
await yesly.appointments.cancel("apt_…", { reason: "Shop closed" }, { idempotencyKey: "cancel-ORD-48213" });
```

## Test mode

A `ysk_test_` key runs everything in test mode; `yesly.mode` says which. Use
the test phone numbers from the API reference (`+34600000001` confirms on
WhatsApp, and so on).

## Development

```bash
npm install
npm test        # build, type-check the README usage, unit tests
```

`src/generated/` is generated from the OpenAPI specification. Do not edit it:
change `yesly-openapi`, then, with both repos checked out side by side,

```bash
(cd ../yesly-openapi && npm install)
npm run generate
```

The rest (`client.ts`, `pagination.ts`, `webhooks.ts`, `errors.ts`) is written
by hand.

Smoke test against the real API with a test key (one call per resource, then
clean-up):

```bash
npm run build && YESLY_API_KEY=ysk_test_… node scripts/smoke.mjs
```

## Releasing

Bump `version` in `package.json` and `src/version.ts`, then push a tag `v<version>`.
