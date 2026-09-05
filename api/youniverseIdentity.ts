import { createNeonYouniverseIdentityRepository } from "../lib/neonYouniverseIdentityRepository.js";
import { createYouniverseIdentityResolver } from "../lib/youniverseRepositoryIdentityResolver.js";
import { createYouniverseIdentityHandler } from "../lib/youniverseIdentityApi.js";

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
