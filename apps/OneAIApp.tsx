import React from "react";
import { AppProps } from "../types";

const OneAIApp: React.FC<AppProps> = () => {
  return (
    <div className="flex h-full w-full flex-col bg-black">
      <iframe 
        src="https://ones.itsyouonline.com"
        className="w-full h-full border-none"
        title="Atom — ONE AI"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone; camera"
        allowFullScreen
      />
    </div>
  );
};

export default OneAIApp;
