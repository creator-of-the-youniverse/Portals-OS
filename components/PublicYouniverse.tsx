import React from "react";
import PortalLayout from "./PortalLayout";
import { useYouniverse } from "./YouniverseProvider";

const PublicYouniverse: React.FC = () => {
  const { identity } = useYouniverse();

  if (!identity || identity.kind !== "identity" || !identity.username) {
    return null;
  }

  return (
    <PortalLayout>
      <div className="flex min-h-full items-center justify-center px-6">
        <div className="text-center">
          <p className="mb-3 text-sm uppercase tracking-[0.35em] text-white/50">
            Youniverse
          </p>

          <h1 className="text-4xl font-semibold tracking-wide text-white">
            @{identity.username}
          </h1>

          <p className="mt-3 text-sm text-white/60">
            {identity.username}.itsyouonline.com
          </p>
        </div>
      </div>
    </PortalLayout>
  );
};

export default PublicYouniverse;
