import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'wouter';
import { Send, MessageCircle, Users } from 'lucide-react';
import { ChatSkeleton } from '@/components/LoadingSkeleton';

interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
}

const COLORS = ['#ff4f7e','#a78bfa','#60a5fa','#34d399','#fb923c','#f472b6','#38bdf8'];
function userColor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = userId.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Community() {
  const { user } = useAuth();
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [online,     setOnline]     = useState(1);
  const [sending,    setSending]    = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useSEO({ title: 'Community Chat', description: 'Chat with the KamiStream anime community in real time.' });

  // Load initial messages
  useEffect(() => {
    supabase
      .from('community_chat')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data || []) as Message[]);
        setLoading(false);
      });
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('community_chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_chat' }, payload => {
        setMessages(prev => [...prev, payload.new as Message].slice(-100));
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setOnline(prev => prev + Math.floor(Math.random() * 3));
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const msg = input.trim();
    if (!msg || !user || sending) return;
    setSending(true);
    setInput('');
    const username = user.email?.split('@')[0] || 'user';
    const { error } = await supabase.from('community_chat').insert({
      user_id: user.id, username, message: msg,
    });
    if (error) { setInput(msg); }
    setSending(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] md:h-[calc(100vh-80px)]">

      {/* Header */}
      <div className="px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg2)] flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-heading font-black text-white text-[15px]">Community Chat</h1>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#06d6a0] animate-pulse" />
            <span>{online} online</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--text3)]" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? <ChatSkeleton /> : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-12 h-12 text-[var(--text3)] mb-3 opacity-40" />
            <p className="text-[var(--text3)] text-[14px] font-bold">No messages yet</p>
            <p className="text-[var(--text3)] text-[12px] mt-1">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn   = msg.user_id === user?.id;
            const color   = userColor(msg.user_id);
            const showUser = i === 0 || messages[i-1].user_id !== msg.user_id;
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                {showUser && !isOwn && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0 mt-1" style={{ background: color }}>
                    {(msg.username || 'U')[0].toUpperCase()}
                  </div>
                )}
                {!showUser && !isOwn && <div className="w-8 shrink-0" />}
                <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                  {showUser && !isOwn && (
                    <span className="text-[10px] font-black mb-1 ml-1" style={{ color }}>@{msg.username}</span>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${isOwn ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white rounded-tr-sm' : 'bg-[var(--card)] border border-[var(--border)] text-white rounded-tl-sm'}`}>
                    {msg.message}
                  </div>
                  {showUser && (
                    <span className="text-[9px] text-[var(--text3)] mt-1 mx-1">{timeAgo(msg.created_at)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--bg2)] shrink-0">
        {!user ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <p className="text-[13px] text-[var(--text3)]">Sign in to join the chat</p>
            <Link href="/login">
              <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-4 py-2 rounded-xl text-[12px] font-bold">Sign In</button>
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message the community…"
              maxLength={500}
              className="flex-1 bg-[var(--card)] border border-[var(--border)] text-white text-[13px] px-4 py-2.5 rounded-xl outline-none focus:border-[var(--purple)] placeholder:text-[var(--text3)]"
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className="w-11 h-11 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white rounded-xl flex items-center justify-center disabled:opacity-50 transition-all hover:brightness-110">
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
