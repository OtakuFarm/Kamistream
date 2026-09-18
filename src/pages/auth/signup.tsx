import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

export default function Signup() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [, setLocation] = useLocation();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Redirect to your live site after email confirmation
        emailRedirectTo: 'https://kamistream.fun/login',
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      // Show confirmation screen instead of redirecting
      setDone(true);
    }
  };

  // ── Email sent confirmation screen ──────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
        <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 text-center shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--purple)] to-[var(--blue)] rounded-t-2xl" />

          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--purple)]/20 to-[var(--blue)]/20 border border-[var(--purple)]/30 flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-[var(--purple)]" />
          </div>

          <h2 className="text-xl font-heading font-black text-white mb-2">Check your email</h2>
          <p className="text-[13px] text-[var(--text2)] mb-1">
            We sent a confirmation link to
          </p>
          <p className="text-[14px] font-bold text-white mb-4">{email}</p>
          <p className="text-[12px] text-[var(--text3)] mb-6 leading-relaxed">
            Click the link in the email to activate your account. Once confirmed you'll be redirected back to KamiStream automatically.
          </p>

          <div className="space-y-2">
            <button
              onClick={() => setLocation('/login')}
              className="w-full bg-gradient-to-r from-[var(--purple)] to-[var(--blue)] text-white font-bold py-3 rounded-xl hover:brightness-110 transition-all text-[14px]"
            >
              Go to Login
            </button>
            <button
              onClick={() => setDone(false)}
              className="w-full text-[12px] text-[var(--text3)] hover:text-white transition-colors py-2"
            >
              Wrong email? Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--bg)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_30%,rgba(155,93,229,0.1),transparent_70%)]" />

      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 relative z-10 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--purple)] to-[var(--blue)] rounded-t-2xl" />

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Email</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--purple)] transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Password</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--purple)] transition-colors"
              placeholder="Create a strong password"
              minLength={6}
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-[var(--purple)] to-[var(--blue)] text-white font-bold py-3 rounded-xl mt-4 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-[13px] text-[var(--text3)]">
          Already have an account?{' '}
          <button onClick={() => setLocation('/login')} className="text-[var(--purple)] font-bold hover:underline">
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
