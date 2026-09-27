/**
 * @file ClubRadioContext - RadioProvider and RadioContext adapted for Portals-OS.
 * Mirrors Club-Youniverse-live/contexts/AudioPlayerContext.tsx
 * but uses services/club/ import paths.
 */

import React, { createContext, useState, useMemo, useRef, useEffect, useCallback } from "react";
import { getBroadcastManager } from "../services/club/globalBroadcastManager";
import { PersistentRadioService } from "../services/club/PersistentRadioService";
import type { Song, RadioState, ChatMessage } from "../services/club/types";

interface RadioContextType {
  nowPlaying: Song | null;
  nextSong: Song | null;
  radioState: RadioState;
  isLeader: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  chatMessages: ChatMessage[];
  tickerText: string;
  djBanter: string;
  leaderId: string | null;
  // Actions
  setVolume: (vol: number) => void;
  setMuted: (muted: boolean) => void;
  togglePlay: () => void;
  addChatMessage: (msg: ChatMessage) => void;
  setTickerText: (text: string) => void;
  setDjBanter: (text: string) => void;
  setRadioState: (state: RadioState) => void;
  setNowPlaying: (song: Song | null) => void;
  claimLeadership: () => Promise<boolean>;
  releaseLeadership: () => Promise<void>;
}

export const ClubRadioContext = createContext<RadioContextType | null>(null);

export const ClubRadioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const broadcastManager = useRef(getBroadcastManager()).current;

  const [nowPlaying, setNowPlayingState] = useState<Song | null>(null);
  const [nextSong, setNextSongState] = useState<Song | null>(null);
  const [radioState, setRadioStateLocal] = useState<RadioState>("POOL");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLeader, setIsLeader] = useState(broadcastManager.isLeader);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(broadcastManager.getVolume());
  const [isMuted, setIsMutedState] = useState(broadcastManager.isMuted());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [tickerText, setTickerText] = useState("♻️ Tuning in to Club Youniverse... the Youniverse speaks.");
  const [djBanter, setDjBanter] = useState("The Youniverse is live. Stand by.");
  const [leaderId, setLeaderId] = useState<string | null>(broadcastManager.getLeaderId());

  const togglePlay = useCallback(() => broadcastManager.togglePlay(), [broadcastManager]);
  const setVolume = useCallback((vol: number) => { broadcastManager.setVolume(vol); setVolumeState(vol); }, [broadcastManager]);
  const setMuted = useCallback((muted: boolean) => { broadcastManager.setMuted(muted); setIsMutedState(muted); }, [broadcastManager]);
  const addChatMessage = useCallback((msg: ChatMessage) => setChatMessages(prev => [...prev, msg].slice(-50)), []);
  const setRadioState = useCallback((state: RadioState) => broadcastManager.setRadioState(state), [broadcastManager]);
  const setNowPlaying = useCallback((song: Song | null) => broadcastManager.setNowPlaying(song), [broadcastManager]);

  useEffect(() => {
    broadcastManager.on("nowPlayingChanged", setNowPlayingState);
    broadcastManager.on("nextSongChanged", setNextSongState);
    broadcastManager.on("radioStateChanged", setRadioStateLocal);
    broadcastManager.on("playbackStateChanged", setIsPlaying);
    broadcastManager.on("leaderChanged", setIsLeader);
    broadcastManager.on("timeUpdate", setCurrentTime);
    broadcastManager.on("volumeChanged", setVolumeState);
    broadcastManager.on("mutedChanged", setIsMutedState);
    broadcastManager.on("leaderIdChanged", setLeaderId);
    broadcastManager.on("siteCommandReceived", (cmd: any) => {
      if (cmd?.type === "ticker") setTickerText(cmd.payload?.text || "");
      else if (cmd?.type === "dj_banter") setDjBanter(cmd.payload?.text || "");
      else if (cmd?.type === "tts" && cmd.payload?.text) {
        const utterance = new SpeechSynthesisUtterance(cmd.payload.text);
        utterance.rate = 0.9;
        utterance.pitch = 0.8;
        window.speechSynthesis.speak(utterance);
      } else if (cmd?.type === "chat" && cmd.payload) {
        setChatMessages(prev => [...prev, cmd.payload].slice(-50));
      }
    });

    // Initial sync
    setNowPlayingState(broadcastManager.getNowPlaying());
    setNextSongState(broadcastManager.getNextSong());
    setRadioStateLocal(broadcastManager.getRadioState());
    setIsPlaying(broadcastManager.isPlaying());
    setIsLeader(broadcastManager.isLeader);

    // Ticker
    let tickerIndex = 0;
    const updateTicker = async () => {
      const cycle = tickerIndex % 3;
      let text = "";
      if (cycle === 0) text = await PersistentRadioService.getBoxStatusSummary();
      else if (cycle === 1 && broadcastManager.getNowPlaying()) {
        text = PersistentRadioService.getNowPlayingFact(broadcastManager.getNowPlaying()!);
      } else {
        const banter = broadcastManager.getDjBanter();
        text = banter || "CLUB YOUNIVERSE — THE VOICE OF THE YOUNIVERSE";
      }
      if (text) setTickerText(text);
      tickerIndex++;
    };

    const tickerInterval = window.setInterval(updateTicker, 20000);
    updateTicker();

    return () => {
      clearInterval(tickerInterval);
      broadcastManager.off("nowPlayingChanged", setNowPlayingState);
      broadcastManager.off("nextSongChanged", setNextSongState);
      broadcastManager.off("radioStateChanged", setRadioStateLocal);
      broadcastManager.off("playbackStateChanged", setIsPlaying);
      broadcastManager.off("leaderChanged", setIsLeader);
      broadcastManager.off("timeUpdate", setCurrentTime);
      broadcastManager.off("volumeChanged", setVolumeState);
      broadcastManager.off("mutedChanged", setIsMutedState);
      broadcastManager.off("leaderIdChanged", setLeaderId);
    };
  }, [broadcastManager]);

  const value = useMemo(() => ({
    nowPlaying, nextSong, radioState, isLeader, isPlaying,
    currentTime, duration: nowPlaying?.durationSec || 0,
    volume, isMuted, chatMessages, tickerText, djBanter, leaderId,
    setVolume, setMuted, togglePlay, addChatMessage,
    setTickerText, setDjBanter, setRadioState, setNowPlaying,
    claimLeadership: () => broadcastManager.claimLeadership(),
    releaseLeadership: () => broadcastManager.releaseLeadership(),
  }), [
    nowPlaying, nextSong, radioState, isLeader, isPlaying,
    currentTime, volume, isMuted, chatMessages, tickerText, djBanter, leaderId,
    setVolume, setMuted, togglePlay, addChatMessage,
    setTickerText, setDjBanter, setRadioState, setNowPlaying
  ]);

  return <ClubRadioContext.Provider value={value}>{children}</ClubRadioContext.Provider>;
};

export const useClubRadio = () => {
  const ctx = React.useContext(ClubRadioContext);
  return ctx;
};
