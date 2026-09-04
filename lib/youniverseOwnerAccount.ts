/**
 * Authoritative owner-account contract.
 *
 * This establishes the relationship between a Youniverse identity
 * and the authenticated principal that is authorized to operate it.
 *
 * authenticationSubject is intentionally provider-neutral.
 * It must not assume email, Firebase, Supabase, OAuth, passwords,
 * or any other authentication implementation.
 *
 * It does NOT:
 * - implement authentication
 * - select an authentication provider
 * - define authorization rules
 * - define a database implementation
 */

export interface YouniverseOwnerAccount {
  accountId: string;
  identityId: string;
  authenticationSubject: string;
  createdAt: string;
}
