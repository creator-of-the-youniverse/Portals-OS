/**
 * @file GlobalBroadcastManager - Adapted for Portals-OS.
 * Singleton service for Club Youniverse radio state management.
 * Uses clubSupabase to avoid conflicting with Portals-OS's own Supabase instance.
 */

import { clubSupabase as supabase } from "./supabaseClient";
import type { Song, RadioState } from "./types";
import { PersistentRadioService } from "./PersistentRadioService";

type EventCallback = (...args: any[]) => void;

const QUERY = "*, current_song:songs!current_song_id(*), next_song:songs!next_song_id(*)";

interface BroadcastState {
  nowPlaying: Song | null;
  nextSong: Song | null;
  radioState: RadioState;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  leaderId: string | null;
  djBanter: string;
}

export class GlobalBroadcastManager {
  private static instance: GlobalBroadcastManager | null = null;

  private audioElement: HTMLAudioElement;
  private eventListeners: Map<string, Set<EventCallback>>;
  private state: BroadcastState;
  private timeUpdateInterval: number | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;

  public getAnalyser(): AnalyserNode | null { return this.analyser; }
  public getDataArray(): Uint8Array | null { return this.dataArray; }

  // Leader Election
  private userId: string | null = null;
  private isLeaderLocal: boolean = false;
  private heartbeatInterval: number | null = null;
  private conductorInterval: number | null = null;
  private lastCommandId: string | null = null;
  private releasedAt: number = 0;
  private siteCommandChannel: any = null;
  private broadcastChannel: any = null;

  private constructor() {
    const existingAudio = (globalThis as any).__CLUB_YOUNIVERSE_AUDIO__;
    if (existingAudio) {
      existingAudio.pause();
      existingAudio.src = "";
      existingAudio.load();
    }
    if ((globalThis as any).__CLUB_YOUNIVERSE_HEARTBEAT__) clearInterval((globalThis as any).__CLUB_YOUNIVERSE_HEARTBEAT__);
    if ((globalThis as any).__CLUB_YOUNIVERSE_CONDUCTOR__) clearInterval((globalThis as any).__CLUB_YOUNIVERSE_CONDUCTOR__);
    if ((globalThis as any).__CLUB_YOUNIVERSE_TIME_UPDATE__) clearInterval((globalThis as any).__CLUB_YOUNIVERSE_TIME_UPDATE__);

    this.audioElement = new Audio();
    this.audioElement.preload = "auto";
    (globalThis as any).__CLUB_YOUNIVERSE_AUDIO__ = this.audioElement;

    this.eventListeners = new Map();
    this.state = this.loadLocalState();
    this.setupAudioHandlers();
    this.startTimeUpdates();
    this.initializeGlobalState();
    this.initLeaderElection();

    console.log("🎙️ [Club Youniverse] GlobalBroadcastManager initialized in Portals-OS");
  }

  public static getInstance(): GlobalBroadcastManager {
    if (!(globalThis as any).__GLOBAL_BROADCAST_MANAGER_INSTANCE__) {
      (globalThis as any).__GLOBAL_BROADCAST_MANAGER_INSTANCE__ = new GlobalBroadcastManager();
    }
    GlobalBroadcastManager.instance = (globalThis as any).__GLOBAL_BROADCAST_MANAGER_INSTANCE__;
    return GlobalBroadcastManager.instance!;
  }

  private async initLeaderElection() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      this.userId = user.id;
      this.startElectionLoop();
    } else {
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !this.userId) {
          this.userId = session.user.id;
          this.startElectionLoop();
        }
      });
    }
  }

  private startElectionLoop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(async () => {
      if (!this.userId) return;
      await this.tryClaimLeadership();
    }, 2000);
    (globalThis as any).__CLUB_YOUNIVERSE_HEARTBEAT__ = this.heartbeatInterval;
    this.tryClaimLeadership();
  }

  public getLeaderId() { return this.state.leaderId; }

  public async claimLeadership(force: boolean = false, previousLeaderId: string | null = null) {
    if (!this.userId) return false;
    this.releasedAt = 0;
    let query = supabase
      .from("broadcasts")
      .update({ leader_id: this.userId, last_heartbeat: new Date().toISOString() })
      .eq("id", "00000000-0000-0000-0000-000000000000");

    if (!force && previousLeaderId !== undefined) {
      query = previousLeaderId === null
        ? query.is("leader_id", null)
        : query.eq("leader_id", previousLeaderId);
    }

    const { error, data } = await query.select();
    if (!error && data && data.length > 0) {
      const wasAlreadyLeader = this.isLeaderLocal;
      this.isLeaderLocal = true;
      this.state.leaderId = this.userId;
      this.emit("leaderIdChanged", this.userId);
      this.emit("leaderChanged", true);
      if (!wasAlreadyLeader) {
        this.stopConductorLoop();
        this.startConductorLoop();
      }
      await this.fetchAndSync();
      return true;
    }
    return false;
  }

  public async releaseLeadership() {
    if (!this.isLeaderLocal || !this.userId) return;
    const { error } = await supabase
      .from("broadcasts")
      .update({ leader_id: null })
      .eq("leader_id", this.userId);
    if (!error) {
      this.isLeaderLocal = false;
      this.releasedAt = Date.now();
      this.state.leaderId = null;
      this.stopConductorLoop();
      this.emit("leaderIdChanged", null);
      this.emit("leaderChanged", false);
      await this.fetchAndSync();
    }
  }

  private async tryClaimLeadership() {
    try {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("leader_id, last_heartbeat")
        .limit(1)
        .single();

      if (error) return;

      const remoteLeaderId = data.leader_id;
      const lastHeartbeat = data.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0;
      const isLeaderDead = !remoteLeaderId || (Date.now() - lastHeartbeat > 10000);

      if (this.state.leaderId !== remoteLeaderId) {
        this.state.leaderId = remoteLeaderId;
        this.emit("leaderIdChanged", remoteLeaderId);
      }

      const amILeader = remoteLeaderId === this.userId;
      const releaseCooldown = Date.now() - this.releasedAt < 15000;

      if (isLeaderDead && this.userId && !releaseCooldown) {
        await this.claimLeadership(false, remoteLeaderId);
        return;
      }

      if (amILeader) {
        if (!this.isLeaderLocal) {
          this.isLeaderLocal = true;
          this.emit("leaderChanged", true);
          this.startConductorLoop();
          this.fetchAndSync();
        }
        await supabase
          .from("broadcasts")
          .update({ last_heartbeat: new Date().toISOString() })
          .eq("leader_id", this.userId);
      } else if (this.isLeaderLocal) {
        if (remoteLeaderId && remoteLeaderId !== this.userId) {
          this.isLeaderLocal = false;
          this.stopConductorLoop();
          this.emit("leaderChanged", false);
        }
      }
    } catch (e) {
      console.error("[ClubRadio] Election error:", e);
    }
  }

  private startConductorLoop() {
    if (this.conductorInterval) clearInterval(this.conductorInterval);
    this.conductorInterval = window.setInterval(async () => {
      if (!this.isLeaderLocal) return;
      try {
        const nextSong = await PersistentRadioService.checkRadioHealth(this.state.nowPlaying);
        if (nextSong) await this.setNowPlaying(nextSong);
        await PersistentRadioService.runSimulationStep();
      } catch (e) {
        console.error("[ClubRadio] Conductor error:", e);
      }
    }, 10000);
    (globalThis as any).__CLUB_YOUNIVERSE_CONDUCTOR__ = this.conductorInterval;
  }

  private stopConductorLoop() {
    if (this.conductorInterval) {
      clearInterval(this.conductorInterval);
      this.conductorInterval = null;
    }
  }

  private loadLocalState(): BroadcastState {
    let volume = 0.6; // Default to 60% in Portals-OS context
    let isMuted = false;
    try {
      const stored = localStorage.getItem("club-youniverse-broadcast-state");
      if (stored) {
        const parsed = JSON.parse(stored);
        volume = parsed.volume ?? 0.6;
        isMuted = parsed.isMuted ?? false;
      }
    } catch (e) {}
    return { nowPlaying: null, nextSong: null, radioState: "POOL", currentTime: 0, volume, isMuted, isPlaying: false, leaderId: null, djBanter: "" };
  }

  private async initializeGlobalState() {
    const { data, error } = await supabase.from("broadcasts").select(QUERY).limit(1).single();
    if (data) this.syncStateFromRemote(data);
    else if (error) console.warn("[ClubRadio] Failed to fetch broadcast state:", error.message);

    if (this.broadcastChannel) supabase.removeChannel(this.broadcastChannel);
    this.broadcastChannel = supabase
      .channel("public:broadcasts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "broadcasts" }, () => {
        this.fetchAndSync();
      })
      .subscribe((status: string, err: any) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[ClubRadio] Broadcast channel failed. Retrying in 5s...");
          setTimeout(() => this.initializeGlobalState(), 5000);
        }
      });

    if (this.siteCommandChannel) supabase.removeChannel(this.siteCommandChannel);
    this.siteCommandChannel = supabase
      .channel("site-commands")
      .on("broadcast", { event: "site_command" }, (payload: any) => {
        const cmd = payload.payload;
        if (cmd?.id && cmd.id !== this.lastCommandId) {
          this.lastCommandId = cmd.id;
          if (cmd.type === "dj_banter") this.state.djBanter = cmd.payload?.text || "";
          this.emit("siteCommandReceived", cmd);
          if (this.isLeaderLocal && cmd.type === "skip") this.handleStateTrigger("POOL");
        }
      })
      .subscribe();
  }

  private async fetchAndSync() {
    const { data } = await supabase.from("broadcasts").select(QUERY).limit(1).single();
    if (data) this.syncStateFromRemote(data);
  }

  private syncStateFromRemote(data: any) {
    if (!data) return;

    const remoteSong = data.current_song ? PersistentRadioService.mapDbToApp(data.current_song) : null;
    const nextSong = data.next_song ? PersistentRadioService.mapDbToApp(data.next_song) : null;
    const remoteState = data.radio_state as RadioState;

    const actionStates: RadioState[] = ["POOL", "THE_BOX", "BOX_WIN", "REBOOT"];
    const isActionState = actionStates.includes(remoteState);

    if (this.state.radioState !== remoteState || isActionState) {
      if (this.state.radioState !== remoteState) {
        this.state.radioState = remoteState;
        this.emit("radioStateChanged", remoteState);
      }
      const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const alreadyProcessed = (globalThis as any).__LAST_ACTION_TIMESTAMP__ >= remoteUpdatedAt;
      if (this.isLeaderLocal && isActionState && !alreadyProcessed) {
        (globalThis as any).__LAST_ACTION_TIMESTAMP__ = remoteUpdatedAt;
        this.handleStateTrigger(remoteState);
      }
    }

    if (nextSong?.id !== this.state.nextSong?.id) {
      this.state.nextSong = nextSong;
      this.emit("nextSongChanged", nextSong);
    }

    if (remoteSong?.id !== this.state.nowPlaying?.id) {
      const offset = this.calculateOffset(data.song_started_at);
      this.setNowPlaying(remoteSong, offset);
    } else if (this.state.isPlaying && !this.isLeaderLocal) {
      const expectedTime = this.calculateOffset(data.song_started_at);
      const drift = Math.abs(this.audioElement.currentTime - expectedTime);
      if (drift > 2) this.audioElement.currentTime = expectedTime;
    }

    if (data.site_command?.id && data.site_command.id !== this.lastCommandId) {
      this.lastCommandId = data.site_command.id;
      const isStale = data.site_command.timestamp && (Date.now() - data.site_command.timestamp > 10000);
      if (!isStale) {
        if (data.site_command.type === "dj_banter") this.state.djBanter = data.site_command.payload?.text || "";
        this.emit("siteCommandReceived", data.site_command);
      }
    }
  }

  private async handleStateTrigger(state: RadioState) {
    switch (state) {
      case "POOL":
      case "BOX_WIN": {
        const next = await PersistentRadioService.handleSongEnded(this.state.nowPlaying);
        if (next) await this.setNowPlaying(next);
        else await this.setRadioState("NOW_PLAYING");
        break;
      }
      case "THE_BOX":
        await PersistentRadioService.forceRefreshBox();
        await this.setRadioState("NOW_PLAYING");
        break;
      case "REBOOT":
        await PersistentRadioService.hardReset();
        break;
    }
  }

  private calculateOffset(startedAt: string): number {
    if (!startedAt) return 0;
    return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
  }

  private saveState(): void {
    try {
      localStorage.setItem("club-youniverse-broadcast-state", JSON.stringify({ volume: this.state.volume, isMuted: this.state.isMuted }));
    } catch {}
  }

  private setupAudioHandlers(): void {
    this.audioElement.addEventListener("play", () => {
      this.state.isPlaying = true;
      this.emit("playbackStateChanged", true);
    });
    this.audioElement.addEventListener("pause", () => {
      this.state.isPlaying = false;
      this.emit("playbackStateChanged", false);
    });
    this.audioElement.addEventListener("ended", async () => {
      this.state.isPlaying = false;
      this.emit("playbackStateChanged", false);
      this.emit("songEnded", this.state.nowPlaying);
      if (this.isLeaderLocal) {
        const next = await PersistentRadioService.handleSongEnded(this.state.nowPlaying);
        this.state.nowPlaying = null;
        this.emit("nowPlayingChanged", null);
        if (next) await this.setNowPlaying(next);
      }
    });
    this.audioElement.addEventListener("volumechange", () => {
      if (this.state.volume !== this.audioElement.volume) {
        this.state.volume = this.audioElement.volume;
        this.emit("volumeChanged", this.audioElement.volume);
        this.saveState();
      }
      if (this.state.isMuted !== this.audioElement.muted) {
        this.state.isMuted = this.audioElement.muted;
        this.emit("mutedChanged", this.audioElement.muted);
        this.saveState();
      }
    });
    this.audioElement.addEventListener("error", () => {
      if (this.isLeaderLocal) {
        setTimeout(() => this.handleStateTrigger("POOL"), 3000);
      }
    });
    this.audioElement.volume = this.state.volume;
    this.audioElement.muted = this.state.isMuted;
    this.audioElement.setAttribute("playsinline", "true");
    this.updateMediaSession();
  }

  private updateMediaSession() {
    if ("mediaSession" in navigator && this.state.nowPlaying) {
      const song = this.state.nowPlaying;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artistName,
        album: "Club Youniverse",
      });
      navigator.mediaSession.setActionHandler("play", () => { this.setMuted(false); this.play().catch(() => {}); });
      navigator.mediaSession.setActionHandler("pause", () => { this.setMuted(true); });
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    }
  }

  private startTimeUpdates(): void {
    if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
    this.timeUpdateInterval = window.setInterval(() => {
      if (this.state.isPlaying && this.state.nowPlaying) {
        this.state.currentTime = this.audioElement.currentTime;
        this.emit("timeUpdate", this.audioElement.currentTime);
      }
    }, 1000);
    (globalThis as any).__CLUB_YOUNIVERSE_TIME_UPDATE__ = this.timeUpdateInterval;
  }

  // --- PUBLIC API ---

  public get isLeader() { return this.isLeaderLocal; }
  public getNowPlaying() { return this.state.nowPlaying; }
  public getNextSong() { return this.state.nextSong; }
  public getRadioState() { return this.state.radioState; }
  public getVolume() { return this.state.volume; }
  public isMuted() { return this.state.isMuted; }
  public isPlaying() { return this.state.isPlaying; }
  public getDjBanter() { return this.state.djBanter; }

  public async setNowPlaying(song: Song | null, startOffset: number = 0): Promise<void> {
    this.state.nowPlaying = song;
    if (song && this.state.radioState !== "NOW_PLAYING" && this.state.radioState !== "DJ_TALKING") {
      this.state.radioState = "NOW_PLAYING";
      this.emit("radioStateChanged", "NOW_PLAYING");
    }
    if (!song) {
      this.audioElement.pause();
      this.audioElement.removeAttribute("src");
      this.audioElement.load();
      this.emit("nowPlayingChanged", null);
      if (this.isLeaderLocal) await this.persistBroadcastState(false);
      return;
    }
    if (!song.audioUrl) return;

    const hasCorrectSrc = this.audioElement.src === song.audioUrl;
    if (!hasCorrectSrc) {
      this.audioElement.src = song.audioUrl;
      this.audioElement.volume = this.state.volume;
      this.audioElement.muted = this.state.isMuted;
      const onMetadataLoaded = () => {
        setTimeout(() => {
          this.audioElement.volume = this.state.volume;
          this.audioElement.muted = this.state.isMuted;
          if (startOffset > 0) this.audioElement.currentTime = startOffset;
        }, 100);
        this.audioElement.removeEventListener("loadedmetadata", onMetadataLoaded);
      };
      this.audioElement.addEventListener("loadedmetadata", onMetadataLoaded);
      this.play().catch((e) => {
        if (e.name === "AbortError") return;
        if (e.name === "NotAllowedError") this.emit("autoplayBlocked", true);
      });
    }

    this.emit("nowPlayingChanged", song);
    this.updateMediaSession();
    if (this.isLeaderLocal) await this.persistBroadcastState(true);
  }

  private async persistBroadcastState(isPlaying: boolean) {
    if (!this.state.nowPlaying) {
      await supabase.from("broadcasts").update({ current_song_id: null, radio_state: "POOL" }).eq("id", "00000000-0000-0000-0000-000000000000");
      return;
    }
    await supabase.from("broadcasts").update({
      current_song_id: this.state.nowPlaying.id,
      song_started_at: isPlaying ? new Date().toISOString() : undefined,
      radio_state: "NOW_PLAYING",
    }).eq("id", "00000000-0000-0000-0000-000000000000");
  }

  public async setRadioState(state: RadioState) {
    this.state.radioState = state;
    this.emit("radioStateChanged", state);
    await supabase.from("broadcasts").update({ radio_state: state }).eq("id", "00000000-0000-0000-0000-000000000000");
  }

  public async setNextSong(song: Song | null) {
    this.state.nextSong = song;
    this.emit("nextSongChanged", song);
  }

  public setVolume(vol: number) {
    this.state.volume = vol;
    this.audioElement.volume = vol;
    this.emit("volumeChanged", vol);
    this.saveState();
  }

  public setMuted(muted: boolean) {
    this.state.isMuted = muted;
    this.audioElement.muted = muted;
    this.emit("mutedChanged", muted);
    this.saveState();
  }

  public togglePlay() {
    if (this.audioElement.paused) {
      this.play().catch(() => {});
    } else {
      this.audioElement.pause();
    }
  }

  public play(): Promise<void> {
    return this.audioElement.play();
  }

  public async sendSiteCommand(type: string, payload: any) {
    const cmd = { id: Date.now().toString(), type, payload, timestamp: Date.now() };
    await supabase.channel("site-commands").send({ type: "broadcast", event: "site_command", payload: cmd });
  }

  public async castVote(stars: number) {
    if (!this.state.nowPlaying) return;
    await supabase.rpc("cast_vote", { p_song_id: this.state.nowPlaying.id, p_stars: stars });
  }

  // --- Event Emitter ---
  public on(event: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: EventCallback) {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]) {
    this.eventListeners.get(event)?.forEach((cb) => cb(...args));
  }
}

/** Singleton accessor */
export const getBroadcastManager = () => GlobalBroadcastManager.getInstance();
