import { Client, type ClientOptions } from "./client.js";
import { resourcesOf } from "./generated/resources.js";
import { webhooks } from "./webhooks.js";

type Resources = ReturnType<typeof resourcesOf>;

// The resources (`appointments`, `slots`, …) are generated from the OpenAPI
// specification and attached in the constructor.
export interface Yesly extends Resources {}

export class Yesly extends Client {
  /** Webhook signature checks. They need the endpoint's secret, not an API key. */
  static readonly webhooks = webhooks;
  readonly webhooks = webhooks;

  constructor(apiKey?: string | ClientOptions, options: ClientOptions = {}) {
    super(apiKey, options);
    Object.assign(this, resourcesOf(this));
  }
}

export default Yesly;
export { Client } from "./client.js";
export type { ClientOptions, RequestOptions } from "./client.js";
export * from "./errors.js";
export { Page, PagePromise } from "./pagination.js";
export { constructEvent, verifySignature, generateTestHeader, DEFAULT_TOLERANCE, type VerifyOptions } from "./webhooks.js";
export { VERSION } from "./version.js";
export { API_VERSION, EVENT_TYPES } from "./generated/types.js";
export type * from "./generated/types.js";
