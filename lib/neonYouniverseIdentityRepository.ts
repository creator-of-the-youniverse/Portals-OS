import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget } from "./creatorOwnership.ts";
import type { YouniverseIdentityRepository } from "./youniverseIdentityRepository";
import type { YouniverseIdentityRecord } from "./youniverseIdentityTypes";

function mapIdentityRow(row: Record<string, any>): YouniverseIdentityRecord {
  return {
    identityId: String(row.identity_id),
    username: String(row.username),
    displayName: String(row.display_name),
    subdomain: String(row.subdomain),
    identityType: row.identity_type as YouniverseIdentityRecord["identityType"],
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

export function createSqlYouniverseIdentityRepository(
  sql: any
): YouniverseIdentityRepository {
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

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return mapIdentityRow(rows[0]);
    },

    async create(identity) {
      const rows = await sql`
        INSERT INTO youniverse_identities (
          identity_id,
          username,
          display_name,
          subdomain,
          identity_type,
          email,
          plan,
          created_at
        )
        VALUES (
          ${identity.identityId},
          ${identity.username},
          ${identity.displayName},
          ${identity.subdomain},
          ${identity.identityType},
          ${(identity as any).email ?? null},
          ${(identity as any).plan ?? "free"},
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

      return mapIdentityRow(rows[0]);
    },
  };
}

export function createNeonYouniverseIdentityRepository(
  databaseUrl: string,
  env: Record<string, string | undefined> = process.env
): YouniverseIdentityRepository {
  assertSafeDatabaseTarget(databaseUrl, env);
  const sql = neon(databaseUrl);
  return createSqlYouniverseIdentityRepository(sql);
}
