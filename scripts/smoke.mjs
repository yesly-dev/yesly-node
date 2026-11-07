// Calls the real API with a test key: one call per resource, then cleans up.
//
//   YESLY_API_KEY=ysk_test_… YESLY_BASE_URL=https://api.dev.yesly.dev/v1 node scripts/smoke.mjs
import Yesly, { YeslyError } from "../dist/index.js";

const yesly = new Yesly();
if (yesly.mode !== "test") throw new Error("Use a ysk_test_ key.");

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const externalId = `SDK-NODE-${Date.now()}`;
const step = (name, value) => console.log(`ok  ${name}${value === undefined ? "" : `: ${value}`}`);

step("balance.retrieve", (await yesly.balance.retrieve()).object);
const types = await yesly.appointmentTypes.list();
step("appointmentTypes.list", types.data.map((t) => t.id).join(","));
step("locations.list", (await yesly.locations.list()).data.length);

const apt = await yesly.appointments.create({
  external_id: externalId,
  type: types.data[0]?.id,
  customer: { name: "SDK smoke", phone: "+34600000001" },
  slot: { start: `${tomorrow}T10:00:00+01:00`, end: `${tomorrow}T12:00:00+01:00` },
  metadata: { source: "sdk-smoke" },
});
step("appointments.create", `${apt.id} ${apt.status}`);
step("appointments.create again (idempotent)", (await yesly.appointments.create({ external_id: externalId, type: types.data[0]?.id, customer: { name: "SDK smoke", phone: "+34600000001" }, slot: { start: `${tomorrow}T10:00:00+01:00`, end: `${tomorrow}T12:00:00+01:00` }, metadata: { source: "sdk-smoke" } })).id === apt.id);
step("appointments.retrieve", (await yesly.appointments.retrieve(apt.id)).external_id);
let n = 0;
for await (const a of yesly.appointments.list({ metadata: { source: "sdk-smoke" }, limit: 1 })) if (++n >= 3) break;
step("appointments.list (auto-paging, limit 1)", n);
step("appointments.update", (await yesly.appointments.update(apt.id, { metadata: { note: "updated" } })).metadata.note);
try {
  step("appointments.cancel", (await yesly.appointments.cancel(apt.id, { reason: "SDK smoke test" })).status);
} catch (e) {
  if (!(e instanceof YeslyError && e.code === "appointment_closed")) throw e;
  step("appointments.cancel", "already closed by the test chain");
}

const we = await yesly.webhookEndpoints.create({ url: "https://example.com/yesly-sdk-smoke", enabled_events: ["appointment.confirmed"] });
step("webhookEndpoints.create", we.id);
step("webhookEndpoints.rollSecret", (await yesly.webhookEndpoints.rollSecret(we.id)).id);
step("webhookEndpoints.delete", (await yesly.webhookEndpoints.delete(we.id)).deleted);

const events = await yesly.events.list({ limit: 5 });
step("events.list", events.data.map((e) => e.type).join(","));
if (events.data[0]) step("events.retrieve", (await yesly.events.retrieve(events.data[0].id)).id);
step("balance.listTransactions", (await yesly.balance.listTransactions({ limit: 5 })).data.length);
step("analytics.retrieveSummary", (await yesly.analytics.retrieveSummary({ range: "7d" })).appointments);

try {
  await yesly.appointments.create({ external_id: `${externalId}-bad`, customer: { phone: "612" }, slot: { start: `${tomorrow}T10:00:00+01:00` } });
} catch (e) {
  step("validation error", `${e.constructor.name} ${e.status} ${e.code} ${e.param} ${e.requestId ? "with request id" : "NO REQUEST ID"}`);
}
