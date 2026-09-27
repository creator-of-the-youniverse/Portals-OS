/**
 * @file PersistentRadioService - Adapted for Portals-OS integration.
 * Handles the Core Radio Cycle: Pool → Box → Play
 * Import paths rewritten to use services/club/ prefix.
 */

import { clubSupabase as supabase } from "./supabaseClient";
import type { Song, ChatMessage } from "./types";
import { LocalAiService } from "./LocalAiService";

export class PersistentRadioService {
  private static lastCheck: number = 0;
  private static lastNewsTime: number = Date.now();
  private static isGeneratingNews: boolean = false;

  /**
   * Maps a DB row to our Song app model.
   */
  static mapDbToApp(row: any): Song {
    return {
      id: row.id,
      uploaderId: row.uploader_id,
      title: row.title || "Untitled",
      artistName: row.artist_name || "Unknown Artist",
      source: row.source || "upload",
      audioUrl: row.audio_url || "",
      durationSec: row.duration_sec || 180,
      genre: row.genre,
      stars: row.stars ?? 5,
      liveStarsSum: row.live_stars_sum ?? 0,
      liveStarsCount: row.live_stars_count ?? 0,
      isDsw: row.is_dsw ?? false,
      boxRoundsSeen: row.box_rounds_seen ?? 0,
      boxRoundsLost: row.box_rounds_lost ?? 0,
      boxAppearanceCount: row.box_appearance_count ?? 0,
      status: row.status || "pool",
      coverArtUrl: row.cover_art_url,
      is_canvas: row.is_canvas ?? false,
      lyrics: row.lyrics,
      playCount: row.play_count ?? 0,
      upvotes: row.upvotes ?? 0,
      downvotes: row.downvotes ?? 0,
      lastPlayedAt: row.last_played_at || new Date().toISOString(),
      sunoUrl: row.suno_url,
      downloadUrl: row.download_url,
      createdAt: row.created_at || new Date().toISOString(),
    };
  }

  /**
   * Watchdog: Ensures the radio is healthy and something is playing.
   */
  static async checkRadioHealth(nowPlaying: Song | null): Promise<Song | null> {
    const now = Date.now();
    if (now - this.lastCheck < 10000) return null;
    this.lastCheck = now;

    await this.populateTheBox();

    const { data: broadcast } = await supabase
      .from("broadcasts")
      .select("song_started_at")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();

    if (!broadcast?.song_started_at) {
      console.log("🛠️ [ClubRadio] Watchdog: No song playing. Kickstarting...");
      return await this.cycleNextToNow();
    }

    if (nowPlaying?.durationSec) {
      const startedAt = new Date(broadcast.song_started_at).getTime();
      const elapsed = (Date.now() - startedAt) / 1000;
      const margin = nowPlaying.durationSec === 180 ? 180 : 45;
      if (elapsed > nowPlaying.durationSec + margin) {
        console.log(`🧟 [ClubRadio] Zombie detected. Force transitioning...`);
        return await this.handleSongEnded(nowPlaying);
      }
    }

    return null;
  }

  static async handleSongEnded(song: Song | null): Promise<Song | null> {
    if (!song) return this.cycleNextToNow();
    const isDebut = song.status === "debut";
    if (isDebut) {
      await this.resolveDebut(song);
    } else {
      await this.returnToPool(song);
    }
    return await this.cycleNextToNow();
  }

  private static async resolveDebut(song: Song) {
    const rating = song.liveStarsCount > 0 ? song.liveStarsSum / song.liveStarsCount : 5;
    const passed = rating >= 2;
    await supabase.from("songs").update({
      status: passed ? "pool" : "graveyard",
      stars: passed ? Math.min(10, rating + 1) : 0,
    }).eq("id", song.id);
  }

  private static async returnToPool(song: Song) {
    await supabase.from("songs").update({ status: "pool" }).eq("id", song.id);
  }

  private static async cycleNextToNow(): Promise<Song | null> {
    const { data: next } = await supabase
      .from("songs")
      .select("*")
      .eq("status", "next_play")
      .limit(1)
      .single();

    if (next) {
      const song = this.mapDbToApp(next);
      await supabase.from("songs").update({ status: "now_playing" }).eq("id", song.id);
      await supabase.from("broadcasts").update({
        current_song_id: song.id,
        song_started_at: new Date().toISOString(),
        radio_state: "NOW_PLAYING",
      }).eq("id", "00000000-0000-0000-0000-000000000000");
      return song;
    }

    const { data: pool } = await supabase
      .from("songs")
      .select("*")
      .eq("status", "pool")
      .gt("stars", 0)
      .order("last_played_at", { ascending: true })
      .limit(1)
      .single();

    if (pool) {
      const song = this.mapDbToApp(pool);
      await supabase.from("songs").update({ status: "now_playing" }).eq("id", song.id);
      await supabase.from("broadcasts").update({
        current_song_id: song.id,
        song_started_at: new Date().toISOString(),
        radio_state: "NOW_PLAYING",
      }).eq("id", "00000000-0000-0000-0000-000000000000");
      return song;
    }

    return null;
  }

  static async populateTheBox() {
    const { data: existing } = await supabase
      .from("songs")
      .select("id")
      .eq("status", "in_box")
      .limit(3);

    if (existing && existing.length >= 3) return;

    const needed = 3 - (existing?.length || 0);
    const { data: pool } = await supabase
      .from("songs")
      .select("*")
      .eq("status", "pool")
      .gt("stars", 0)
      .order("last_played_at", { ascending: true })
      .limit(needed);

    if (!pool?.length) return;
    const ids = pool.map((s: any) => s.id);
    await supabase.from("songs").update({ status: "in_box" }).in("id", ids);
  }

  static async forceRefreshBox() {
    await supabase.from("songs").update({ status: "pool" }).eq("status", "in_box");
    await this.populateTheBox();
  }

  static async hardReset() {
    await supabase.from("songs").update({ status: "pool" }).in("status", ["in_box", "now_playing", "next_play"]);
    await supabase.from("broadcasts").update({
      radio_state: "POOL",
      current_song_id: null,
      song_started_at: null,
    }).eq("id", "00000000-0000-0000-0000-000000000000");
  }

  static async runSimulationStep() {
    // Simulate votes from bots/fallback when no real listeners
    const { data: boxSongs } = await supabase
      .from("songs")
      .select("id, live_stars_count")
      .eq("status", "in_box")
      .limit(3);

    if (!boxSongs?.length) return;
    // Only simulate if no real votes have come in (count == 0)
    for (const song of boxSongs) {
      if (song.live_stars_count === 0) {
        const simVote = Math.floor(Math.random() * 4) + 4; // 4-7 stars
        await supabase.rpc("cast_vote", { p_song_id: song.id, p_stars: simVote }).maybeSingle();
      }
    }
  }

  static async getBoxStatusSummary(): Promise<string> {
    const { data } = await supabase
      .from("songs")
      .select("title, artist_name, stars")
      .eq("status", "in_box")
      .limit(3);

    if (!data?.length) return "THE BOX IS EMPTY. LOADING NEW CONTENDERS...";
    return `IN THE BOX: ${data.map((s: any) => `"${s.title}" (★${s.stars})`).join(" vs ")}`;
  }

  static getNowPlayingFact(song: Song): string {
    const dur = `${Math.floor(song.durationSec / 60)}:${String(Math.floor(song.durationSec % 60)).padStart(2, "0")}`;
    return `NOW PLAYING: "${song.title}" by ${song.artistName.toUpperCase()} — ${dur} — ★${song.stars.toFixed(1)} — ${song.playCount} plays`;
  }

  static async getLeaderboardSummary(): Promise<string> {
    const { data } = await supabase
      .from("songs")
      .select("title, artist_name, stars, play_count")
      .gt("stars", 0)
      .not("status", "eq", "graveyard")
      .order("stars", { ascending: false })
      .limit(3);

    if (!data?.length) return "LEADERBOARD: INITIALIZING...";
    return data.map((s: any, i: number) => `#${i + 1} "${s.title}" ★${s.stars.toFixed(1)}`).join(" | ");
  }

  private static async generateAndQueueNews() {
    try {
      // Placeholder — actual news pipeline is Python-based
      console.log("[ClubRadio] News generation skipped in Portals-OS context");
    } finally {
      this.isGeneratingNews = false;
      this.lastNewsTime = Date.now();
    }
  }
}
