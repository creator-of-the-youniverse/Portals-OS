import React, { useState } from "react";
import { AppProps } from "../types";
import { MessageSquare, Send } from "lucide-react";
import { useYouniverse } from "../components/YouniverseProvider";

interface GuestMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

const MessagesApp: React.FC<AppProps> = () => {
  const { identity } = useYouniverse();
  const username = identity?.username || "Guest";

  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([
    {
      id: "1",
      author: "ONEAI",
      text: "This Youniverse is live. Leave a message for the sovereign.",
      timestamp: "just now",
    },
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        author: "Visitor",
        text: messageText.trim(),
        timestamp: "just now",
      },
    ]);
    setMessageText("");
  };

  return (
    <div className="flex h-full w-full flex-col bg-black/90 p-4 text-cyan-200">
      <div className="mb-4 flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-bold tracking-tight text-white">Public Messages</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex-shrink-0 text-xs font-bold text-cyan-300">
              {msg.author[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-white/90">{msg.author}</span>
                <span className="text-[10px] text-white/40">{msg.timestamp}</span>
              </div>
              <p className="text-sm text-white/70 leading-snug">{msg.text}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSendMessage} className="flex gap-2 mt-auto pt-2 border-t border-white/10">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder={`Say something to @${username}...`}
          maxLength={200}
          className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/60 transition-colors"
        />
        <button
          type="submit"
          disabled={!messageText.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-40 disabled:pointer-events-none"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};

export default MessagesApp;
