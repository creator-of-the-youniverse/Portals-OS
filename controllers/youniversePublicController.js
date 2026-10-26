import publicHandler from "../api/youniverse/[handle]/public.ts";

export async function getYouniversePublicDataHandler(req, res, deps = {}) {
  return publicHandler(req, res, deps);
}
