import { createNeonYouniverseIdentityRepository } from "../lib/neonYouniverseIdentityRepository.ts";
import { createYouniverseIdentityResolver } from "../lib/youniverseRepositoryIdentityResolver.ts";
import { createYouniverseIdentityHandler } from "../lib/youniverseIdentityApi.ts";

export default async function handler(req: any, res: any) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      status: "configuration-error",
    });
  }

  const repository =
    createNeonYouniverseIdentityRepository(databaseUrl);

  const resolver =
    createYouniverseIdentityResolver(repository);

  return createYouniverseIdentityHandler({
    resolver,
  })(req, res);
}
