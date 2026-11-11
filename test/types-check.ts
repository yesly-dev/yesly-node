// Compiled, not run: fails the build if the public types stop fitting the README usage.
import Yesly, { type Contact, type Conversation, type Event, InvalidRequestError } from "../src/index.js";

const yesly = new Yesly(process.env.YESLY_API_KEY);

async function usage() {
  const contact: Contact = await yesly.contacts.create({ external_id: "customer-3391", name: "Marta", phone: "+34600000001" });
  const conversation: Conversation = await yesly.conversations.create(
    {
      agent: "agt_8Hd2kQ4mZ1LpXy",
      contact: contact.id,
      channels: ["whatsapp", "call"],
      start_at: "2026-12-01T10:00:00+01:00",
      context: { order: "8841", delivery_window: "2026-12-02T09:00/13:00" },
    },
    { idempotencyKey: "order-8841-delivery" },
  );
  conversation.status satisfies "scheduled" | "in_progress" | "ended" | "no_reply" | "cancelled" | "failed";
  await yesly.conversations.create({ agent: "agt_8Hd2kQ4mZ1LpXy", contact: { external_id: "customer-3391", phone: "+34600000001" }, channels: ["call"] });

  for await (const c of yesly.conversations.list({ agent: "agt_8Hd2kQ4mZ1LpXy", status: "no_reply" })) c.id.toUpperCase();
  const page = await yesly.events.list({ limit: 10 });
  page.data[0]?.type;
  await yesly.conversations.cancel("cnv_7Qp4Ns2Xk9Lm3D", { idempotencyKey: "cancel-order-8841" });
  for await (const turn of yesly.conversations.listMessages(conversation.id)) turn.text.toUpperCase();
  const agent = await yesly.agents.retrieve("agt_8Hd2kQ4mZ1LpXy");
  agent.outcomes.map((o) => o.code);
  await yesly.messages.create({ agent: agent.id, contact: contact.id, channel: "sms", text: "Hola Marta" });

  // @ts-expect-error channels is required
  await yesly.conversations.create({ agent: "agt_8Hd2kQ4mZ1LpXy", contact: contact.id });
  // @ts-expect-error a conversation cannot be written on a channel that does not exist
  await yesly.conversations.create({ agent: "agt_8Hd2kQ4mZ1LpXy", contact: contact.id, channels: ["fax"] });

  const event: Event = Yesly.webhooks.constructEvent("{}", "t=1,v1=00", "whsec_x");
  if (event.type === "conversation.ended") event.data.conversation.outcome?.code;

  try {
    await yesly.balance.retrieve();
  } catch (e) {
    if (e instanceof InvalidRequestError) e.code?.toLowerCase();
  }
}
void usage;
