// Compiled, not run: fails the build if the public types stop fitting the README usage.
import Yesly, { type Appointment, type Event, InvalidRequestError } from "../src/index.js";

const yesly = new Yesly(process.env.YESLY_API_KEY);

async function usage() {
  const apt: Appointment = await yesly.appointments.create({
    external_id: "ORD-48213",
    type: "delivery",
    customer: { name: "Martha", phone: "+34612345678" },
    slot: { start: "2026-11-13T09:00:00+01:00", end: "2026-11-13T11:00:00+01:00" },
    metadata: { order_id: "PV-18342", route_id: "BIO-07" },
  });
  apt.status satisfies "scheduled" | "in_progress" | "confirmed" | "rescheduled" | "reschedule_requested" | "cancelled" | "no_reply";

  for await (const a of yesly.appointments.list({ status: "no_reply", metadata: { route_id: "BIO-07" } })) a.external_id.toUpperCase();
  const page = await yesly.events.list({ limit: 10 });
  page.data[0]?.type;

  const slots = await yesly.slots.create({ slots: [{ start: "2026-11-13T09:00:00+01:00", end: "2026-11-13T11:00:00+01:00", type: "delivery" }] });
  slots.data.length;

  // @ts-expect-error external_id is required
  await yesly.appointments.create({ customer: { phone: "+34600000001" }, slot: { start: "2026-11-13T09:00:00+01:00" } });

  const event: Event = Yesly.webhooks.constructEvent("{}", "t=1,v1=00", "whsec_x");
  if (event.type === "appointment.confirmed") event.data.appointment.id;

  try {
    await yesly.balance.retrieve();
  } catch (e) {
    if (e instanceof InvalidRequestError) e.code?.toLowerCase();
  }
}
void usage;
