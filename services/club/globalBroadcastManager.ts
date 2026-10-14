// GlobalBroadcastManager.ts / ClubRadio.tsx (Stubbed to prevent Supabase errors)

export const initializeGlobalState = async () => {
  console.log('🎙️ [Club Youniverse] Radio state stubbed for windowed launcher.');
  return { currentSong: null, nextSong: null, isLive: true };
};

export default function ClubRadioWidget() {
  const handleOpenClub = () => {
    window.open('https://www.clubyouniverse.live/club', '_blank');
  };

  return (
    <button
      onClick= { handleOpenClub }
  className = "flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-800 font-mono text-xs transition-all shadow-md group"
    >
    <span>📻 Club Youniverse </span>
      </button>
  );
}