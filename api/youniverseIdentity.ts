import { assertSafeDatabaseTarget } from "../lib/creatorOwnership.ts";
import { createNeonYouniverseIdentityRepository } from "../lib/neonYouniverseIdentityRepository.ts";
import { createYouniverseIdentityResolver } from "../lib/youniverseRepositoryIdentityResolver.ts";
import { createYouniverseIdentityHandler } from "../lib/youniverseIdentityApi.ts";

export default async function handler(req: any, res: any, deps: any = {}) {
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      status: "configuration-error",
    });
  }
  assertSafeDatabaseTarget(databaseUrl, deps?.env ?? process.env);

  const repository =
    createNeonYouniverseIdentityRepository(databaseUrl);

  const resolver =
    createYouniverseIdentityResolver(repository);

  return createYouniverseIdentityHandler({
    resolver,
  })(req, res);
}
