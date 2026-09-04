import { neon } from "@neondatabase/serverless";
import type { YouniverseIdentityRepository } from "./youniverseIdentityRepository";
import type { YouniverseIdentityRecord } from "./youniverseIdentityTypes";

export function createNeonYouniverseIdentityRepository(
  databaseUrl: string
): YouniverseIdentityRepository {
  const sql = neon(databaseUrl);

  return {
    async findByUsername(username) {
      const rows = await sql`
        SELECT
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          created_at
        FROM youniverse_identities
        WHERE username = ${username}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];

      return {
        identityId: String(row.identity_id),
        username: String(row.username),
        displayName: String(row.display_name),
        subdomain: String(row.subdomain),
        identityType: row.identity_type as YouniverseIdentityRecord["identityType"],
        createdAt: new Date(row.created_at as string | Date).toISOString(),
      };
    },

    async create(identity) {
      const rows = await sql`
        INSERT INTO youniverse_identities (
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          created_at
        )
        VALUES (
          ${identity.identityId},
          ${identity.username},
          ${identity.displayName},
          ${identity.subdomain},
          ${identity.identityType},
          ${identity.createdAt}
        )
        RETURNING
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          created_at
      `;

      const row = rows[0];

      return {
        identityId: String(row.identity_id),
        username: String(row.username),
        displayName: String(row.display_name),
        subdomain: String(row.subdomain),
        identityType: row.identity_type as YouniverseIdentityRecord["identityType"],
        createdAt: new Date(row.created_at as string | Date).toISOString(),
      };
    },
  };
}
