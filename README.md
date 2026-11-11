# yesly-node

The official Node.js library for the Yesly API.

> Status: 0.2.0, not published yet. Covers API version `2026-11-11`.

## Install

```bash
npm install @yesly/node
```

Node.js 20.19 or later. ESM, with TypeScript types; no runtime dependencies.

## Usage

Yesly runs agents built for your company. The usual integration is two calls:
ask an agent to contact someone, and receive the outcome on a webhook.

```js
import Yesly from "@yesly/node";

const yesly = new Yesly(process.env.YESLY_API_KEY);

// Create the contact, or update it by your own id.
const contact = await yesly.contacts.create({
  external_id: "customer-3391",
  name: "Marta",
  phone: "+34600000001",
});

// Ask the delivery agent to contact her: WhatsApp first, then a call.
const conversation = await yesly.conversations.create(
  {
    agent: "agt_8Hd2kQ4mZ1LpXy",
    contact: contact.id,
    channels: ["whatsapp", "call"],
    start_at: "2026-12-01T10:00:00+01:00",
    context: { order: "8841", delivery_window: "2026-12-02T09:00/13:00" },
  },
  { idempotencyKey: "order-8841-delivery" },
);
conversation.status; // "scheduled"
```

`contact` also takes the data to find or create one
(`{ external_id, phone, name }`), so the first call is optional. The key
defaults to `YESLY_API_KEY`. Every resource of the API reference is a property
of the client: `agents`, `senders`, `contacts`, `conversations`, `messages`,
`templates`, `optOuts`, `analytics`, `balance`, `webhookEndpoints` and
`events`. Requests and responses keep the API's field names (`external_id`),
with types for each.

## Integration checklist

These are the points an integration most often gets wrong; check them before
going live. The whole API reference is also in Markdown, for agents and other
tools: [llms-full.txt](https://yesly.dev/llms-full.txt) (index in
[llms.txt](https://yesly.dev/llms.txt), OpenAPI in
[openapi.yaml](https://yesly.dev/openapi.yaml)).

1. **Read your agent first** (`yesly.agents.retrieve`). It declares the
   `outcomes` it can end with and the `context` it expects; a context that
   does not fit is a `422` `context_invalid` with the field in `param`.
2. **Use your own id as the contact's `external_id`.** Contacts are matched
   only by exact identifiers (`external_id`, then a phone, then an email), and
   `contacts.create` adds what is new to the one it finds. An identifier that
   belongs to another contact is a `409` `contact_identifier_taken`: merge the
   two first (`yesly.contacts.merge`).
3. **Send an `Idempotency-Key` with every new conversation**, derived from your
   own data (`order-8841-delivery`). The library adds a random one to each
   call; your own makes a retry after a crash safe too.
4. **Send times with an offset** (`2026-12-01T10:00:00+01:00`) and phones in
   E.164. Live contacts must be in Spain, and not premium or special-rate
   numbers (`phone_not_allowed`).
5. **Handle the outcome on a webhook.** Verify the signature over the raw
   body, answer `2xx` within 10 seconds before doing slow work, and skip event
   ids you have already handled: a delivery can arrive more than once.
   `conversation.ended` carries the conversation with its `outcome`
   (`{ code, data }`); `conversation.no_reply`, `conversation.cancelled` and
   `conversation.failed` close the others.
6. **Build and test with a `ysk_test_` key.** The test phone numbers choose
   what happens (`+34600000001` answers and the agent ends with its first
   outcome, `+34600000009` never answers; the full table is in the reference)
   and waits last seconds.
7. **Retry only what can succeed.** The library already retries network
   errors, `408`, `429` and `5xx`, with the same idempotency key. A `4xx`
   fails the same way again: fix the request using the error's `code` and
   `param`.
8. **Keep keys on the server.** A read-only key can list and retrieve but not
   write (`api_key_read_only`); a key limited to one agent gets `403`
   `api_key_agent_scope` on any other.

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
  if (event.type === "conversation.ended") {
    const { id, outcome, context } = event.data.conversation;
    // outcome: { code: "rescheduled", data: { delivery_window: "2026-12-03T09:00/13:00" } }
  }
  res.json({ received: true });
});
```

`constructEvent` rejects deliveries more than five minutes old and accepts
either signature during a secret roll. `Yesly.webhooks` works without an API
key, and `generateTestHeader` signs a payload to test your handler.
A delivery can arrive more than once, and a captured one stays valid for
those five minutes, so skip events whose `id` you have already handled.

## Lists

`await` a list for one page, or iterate it to walk every page:

```js
const page = await yesly.events.list({ limit: 50 });
page.data; page.has_more; await page.nextPage();

for await (const c of yesly.conversations.list({ agent: "agt_8Hd2kQ4mZ1LpXy", status: "no_reply" })) {
  console.log(c.id, c.context);
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
  await yesly.conversations.create({ … });
} catch (e) {
  if (e instanceof InvalidRequestError && e.code === "context_invalid") { … }
}
```

## Retries, timeouts and idempotency

Network errors, timeouts, 408, 429 and 5xx are retried twice with backoff,
honouring `Retry-After`. POSTs that take an `Idempotency-Key` get one per call,
reused on every retry; pass your own with `{ idempotencyKey }`.

```js
new Yesly({ apiKey, timeout: 10_000, maxRetries: 4 });
await yesly.conversations.cancel("cnv_7Qp4Ns2Xk9Lm3D", { idempotencyKey: "cancel-order-8841" });
```

## Test mode

A `ysk_test_` key runs everything in test mode; `yesly.mode` says which. Use
the test phone numbers from the API reference (`+34600000001` answers on the
first channel and the agent ends with its first outcome, and so on).

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
