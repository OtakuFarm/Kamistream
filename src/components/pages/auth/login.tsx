import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Welcome back!');
      setLocation('/');
    }
  };

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
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--pink)] transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[var(--pink)] transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-bold py-3 rounded-xl mt-4 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 text-center text-[13px] text-[var(--text3)]">
          Don't have an account? <button onClick={() => setLocation('/signup')} className="text-[var(--pink)] font-bold hover:underline">Sign up</button>
        </div>
      </div>
    </div>
  );
}
