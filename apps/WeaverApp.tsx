import React from "react";
import { AppProps } from "../types";
import WeaverStudio from "../components/weaver/WeaverStudio";

const WeaverApp: React.FC<AppProps> = () => {
  return (
    <div className="w-full h-full bg-zinc-950 text-white overflow-hidden">
      <WeaverStudio embedded />
    </div>
  );
};

export default WeaverApp;
