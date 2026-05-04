import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

export default function Login() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      // Supabase returns this when email isn't confirmed yet
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('email confirmation') ||
        error.message.toLowerCase().includes('not confirmed')
      ) {
        setNeedsConfirm(true);
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Welcome back!');
      setLocation('/');
    }
  };

  // ── Unconfirmed email nudge ──────────────────────────────────────────
  if (needsConfirm) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
        <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 text-center shadow-2xl relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-t-2xl" />

          <div className="w-16 h-16 rounded-2xl bg-[var(--gold)]/10 border border-[var(--gold)]/30 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-[var(--gold)]" />
          </div>

          <h2 className="text-xl font-heading font-black text-white mb-2">Confirm your email first</h2>
          <p className="text-[13px] text-[var(--text2)] mb-1">
            We sent a confirmation link to
          </p>
          <p className="text-[14px] font-bold text-white mb-4">{email}</p>
          <p className="text-[12px] text-[var(--text3)] mb-6 leading-relaxed">
            Check your inbox and click the confirmation link. Once done, come back here and log in.
          </p>

          <div className="space-y-2">
            <button
              onClick={async () => {
                const { error } = await supabase.auth.resend({
                  type: 'signup', email,
                  options: { emailRedirectTo: 'https://kamistream.fun/login' },
                });
                if (error) toast.error(error.message);
                else toast.success('Confirmation email resent!');
              }}
              className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-bold py-3 rounded-xl hover:brightness-110 transition-all text-[14px]"
            >
              Resend Confirmation Email
            </button>
            <button
              onClick={() => setNeedsConfirm(false)}
              className="w-full text-[12px] text-[var(--text3)] hover:text-white transition-colors py-2"
            >
              ← Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--bg)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_30%,rgba(255,45,120,0.1),transparent_70%)]" />

      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 relative z-10 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-t-2xl" />

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Email</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--pink)] transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Password</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--pink)] transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-bold py-3 rounded-xl mt-4 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 text-center text-[13px] text-[var(--text3)]">
          Don't have an account?{' '}
          <button onClick={() => setLocation('/signup')} className="text-[var(--pink)] font-bold hover:underline">
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
