import React from "react";
import WeaverSandbox from "../components/weaver/WeaverSandbox";

const WeavedWidgetApp: React.FC<{ metadata?: any }> = ({ metadata }) => {
  return (
    <div className="w-full h-full bg-zinc-950/80 backdrop-blur-md flex flex-col">
      <WeaverSandbox 
        code={metadata?.code || null} 
        componentName={metadata?.componentName || null} 
      />
    </div>
  );
};

export default WeavedWidgetApp;
