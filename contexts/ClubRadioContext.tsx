import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface NowPlayingTrack {
  id?: string;
  title: string;
  artist: string;
  djName?: string;
  artwork?: string;
}

export interface ClubRadioContextValue {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  nowPlaying: NowPlayingTrack;
  tickerText: string;
  djBanter?: string | null;
  togglePlay: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (vol: number) => void;
}

const defaultTrack: NowPlayingTrack = {
  id: "track-1",
  title: "Ambient Frequencies",
  artist: "Club Youniverse",
  djName: "DJ Neon",
  artwork: "/assets/images/you.png",
};

const ClubRadioContext = createContext<ClubRadioContextValue | null>(null);

export const ClubRadioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack>(defaultTrack);
  const [djBanter, setDjBanter] = useState<string | null>("Broadcasting live across the Youniverse.");

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const value: ClubRadioContextValue = {
    isPlaying,
    isMuted,
    volume,
    nowPlaying,
    tickerText: `${nowPlaying.artist} — ${nowPlaying.title} · Live on Club Youniverse`,
    djBanter,
    togglePlay,
    setMuted: setIsMuted,
    setVolume,
  };

  return (
    <ClubRadioContext.Provider value={value}>
      {children}
    </ClubRadioContext.Provider>
  );
};

export function useClubRadio(): ClubRadioContextValue | null {
  return useContext(ClubRadioContext);
}

export const initializeGlobalState = async () => {
  return { currentSong: null, nextSong: null, isLive: true };
};

export default function ClubRadioWidget() {
  const handleOpenClub = () => {
    window.open("https://www.clubyouniverse.live/club", "_blank");
  };

  return (
    <button
      onClick={handleOpenClub}
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-800 font-mono text-xs transition-all shadow-md group"
    >
      <span>📻 Club Youniverse</span>
    </button>
  );
}