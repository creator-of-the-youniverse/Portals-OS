import React from "react";
import { AppProps } from "../types";
import { BarChart3, Star, TrendingUp } from "lucide-react";
import { useYouniverse } from "../components/YouniverseProvider";

const OmniediaApp: React.FC<AppProps> = () => {
  return (
    <div className="flex h-full w-full flex-col bg-black">
      <iframe 
        src="https://omnedia.itsyouonline.com"
        className="w-full h-full border-none"
        title="Omniedia Global Score"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
};

export default OmniediaApp;
