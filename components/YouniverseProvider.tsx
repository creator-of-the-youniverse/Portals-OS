import React, { createContext, useContext } from 'react';
import type { YouniverseBootstrap } from '../lib/youniverseBootstrap';

const YouniverseContext =
  createContext<YouniverseBootstrap | null>(null);

interface YouniverseProviderProps {
  bootstrap: YouniverseBootstrap;
  children: React.ReactNode;
}

export const YouniverseProvider: React.FC<
  YouniverseProviderProps
> = ({ bootstrap, children }) => {
  return (
    <YouniverseContext.Provider value={bootstrap}>
      {children}
    </YouniverseContext.Provider>
  );
};

export function useYouniverse(): YouniverseBootstrap {
  const context = useContext(YouniverseContext);

  if (!context) {
    throw new Error(
      'useYouniverse must be used within YouniverseProvider'
    );
  }

  return context;
}
