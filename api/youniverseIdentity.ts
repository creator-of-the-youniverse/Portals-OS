import { assertSafeDatabaseTarget } from "../lib/creatorOwnership.ts";
import {
  createNeonYouniverseIdentityRepository,
  createSqlYouniverseIdentityRepository,
} from "../lib/neonYouniverseIdentityRepository.ts";
import { createYouniverseIdentityResolver } from "../lib/youniverseRepositoryIdentityResolver.ts";
import { createYouniverseIdentityHandler } from "../lib/youniverseIdentityApi.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  const env = deps?.env ?? process.env;

  let resolver = deps?.resolver;

  if (!resolver) {
    let repository = deps?.repository;

    if (!repository) {
      if (deps?.sql) {
        repository = createSqlYouniverseIdentityRepository(deps.sql);
      } else {
        const databaseUrl = deps?.databaseUrl ?? env.DATABASE_URL;

        if (!databaseUrl) {
          return res.status(500).json({
            status: "configuration-error",
          });
        }

        assertSafeDatabaseTarget(databaseUrl, env);
        repository = createNeonYouniverseIdentityRepository(databaseUrl, env);
      }
    }

    resolver = createYouniverseIdentityResolver(repository);
  }

  return createYouniverseIdentityHandler({
    resolver,
  })(req, res);
}
