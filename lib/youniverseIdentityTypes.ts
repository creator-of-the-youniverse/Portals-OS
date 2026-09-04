/**
 * Canonical Youniverse identity contract.
 *
 * This describes an identity registered within ItsYouOnline.
 *
 * It does NOT:
 * - authenticate the owner
 * - prove ownership
 * - authorize capabilities
 * - define a database implementation
 * - define an authentication provider
 */

export type YouniverseIdentityType = "person" | "agent";

export interface YouniverseIdentityRecord {
  identityId: string;
  username: string;
  displayName: string;
  email: string;
  subdomain: string;
  identityType: YouniverseIdentityType;
  createdAt: string;
}
