import React from "react";
import { AppProps } from "../types";

const WebApp: React.FC<AppProps> = ({ window }) => {
  const url = window?.metadata?.url || "https://example.com";
  
  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* 
        Security Note: Some major sites set X-Frame-Options to DENY or SAMEORIGIN, 
        which prevents them from being loaded in an iframe. In a production desktop 
        environment (Electron/Tauri), this would be a webview. For this web build, 
        it functions as a standard iframe.
      */}
      <iframe 
        src={url}
        className="w-full h-full border-none bg-white"
        title={window?.metadata?.title || "Web App"}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
};

export default WebApp;
