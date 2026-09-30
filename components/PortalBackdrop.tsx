import React from "react";
import { AsmrBackground } from "./AsmrBackground";
import "./WelcomeScreen.css";

interface PortalBackdropProps {
  children: React.ReactNode;
}

export const PortalBackdrop: React.FC<PortalBackdropProps> = ({ children }) => {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-cover bg-center welcome-screen-background overflow-hidden">
      <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 1 }}>
        <AsmrBackground />
      </div>
      <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 10 }}>
        <img
          src="/assets/images/you.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ mixBlendMode: 'screen' }}
        />
      </div>
      <div className="relative z-20 w-full h-full flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};
