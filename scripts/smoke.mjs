// Calls the real API with a test key: one call per resource, then cleans up.
//
//   YESLY_API_KEY=ysk_test_… node scripts/smoke.mjs
import Yesly from "../dist/index.js";

const yesly = new Yesly();
if (yesly.mode !== "test") throw new Error("Use a ysk_test_ key.");

const externalId = `SDK-NODE-${Date.now()}`;
const step = (name, value) => console.log(`ok  ${name}${value === undefined ? "" : `: ${value}`}`);

step("balance.retrieve", (await yesly.balance.retrieve()).object);
const agents = await yesly.agents.list();
step("agents.list", agents.data.map((a) => a.id).join(","));
step("senders.list", (await yesly.senders.list()).data.length);
step("templates.list", (await yesly.templates.list()).data.length);

const contact = await yesly.contacts.create({ external_id: externalId, name: "SDK smoke", phone: "+34600000001", metadata: { source: "sdk-smoke" } });
step("contacts.create", contact.id);
step("contacts.create again (same contact)", (await yesly.contacts.create({ external_id: externalId, phone: "+34600000001" })).id === contact.id);
step("contacts.retrieve", (await yesly.contacts.retrieve(contact.id)).external_id);
step("contacts.update", (await yesly.contacts.update(contact.id, { metadata: { note: "updated" } })).metadata.note);
let n = 0;
for await (const c of yesly.contacts.list({ limit: 1 })) if (++n >= 3) break;
step("contacts.list (auto-paging, limit 1)", n);
step("contacts.listMemory", (await yesly.contacts.listMemory(contact.id)).data.length);

const agent = agents.data.find((a) => a.status === "active");
if (agent) {
  const cnv = await yesly.conversations.create({ agent: agent.id, contact: contact.id, channels: [agent.channels[0]] }, { idempotencyKey: `${externalId}-cnv` });
  step("conversations.create", `${cnv.id} ${cnv.status}`);
  step("conversations.create again (replayed)", (await yesly.conversations.create({ agent: agent.id, contact: contact.id, channels: [agent.channels[0]] }, { idempotencyKey: `${externalId}-cnv` })).id === cnv.id);
  step("conversations.retrieve", (await yesly.conversations.retrieve(cnv.id)).status);
  step("conversations.list", (await yesly.conversations.list({ contact: contact.id })).data.length);
  step("conversations.listMessages", (await yesly.conversations.listMessages(cnv.id)).data.length);
  step("messages.list", (await yesly.messages.list({ conversation: cnv.id })).data.length);
} else {
  step("conversations.*", "skipped: the account has no active agent");
}

const optOut = await yesly.optOuts.create({ channel: "sms", address: "+34600000099" });
step("optOuts.create", optOut.id);
step("optOuts.delete", (await yesly.optOuts.delete(optOut.id)).deleted);

const we = await yesly.webhookEndpoints.create({ url: "https://example.com/yesly-sdk-smoke", enabled_events: ["conversation.ended"] });
step("webhookEndpoints.create", we.id);
step("webhookEndpoints.rollSecret", (await yesly.webhookEndpoints.rollSecret(we.id)).id);
step("webhookEndpoints.delete", (await yesly.webhookEndpoints.delete(we.id)).deleted);

const events = await yesly.events.list({ limit: 5 });
step("events.list", events.data.map((e) => e.type).join(","));
if (events.data[0]) step("events.retrieve", (await yesly.events.retrieve(events.data[0].id)).id);
step("balance.listTransactions", (await yesly.balance.listTransactions({ limit: 5 })).data.length);
step("analytics.summary", (await yesly.analytics.summary({ range: "7d" })).conversations);

try {
  await yesly.contacts.create({ external_id: `${externalId}-bad`, phone: "612" });
} catch (e) {
  step("validation error", `${e.constructor.name} ${e.status} ${e.code} ${e.param} ${e.requestId ? "with request id" : "NO REQUEST ID"}`);
}
step("contacts.delete", (await yesly.contacts.delete(contact.id)).deleted);
