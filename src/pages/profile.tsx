import React from 'react';
import { useAuth } from '@/lib/auth';
import { useLocation } from 'wouter';

export default function Profile() {
  const { user, signOut } = useAuth();
  const [location, setLocation] = useLocation();

  if (!user) {
    setLocation('/login');
    return null;
  }

  const initial = user.email?.[0].toUpperCase() || 'U';
  const username = user.email?.split('@')[0] || 'User';

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden relative mb-8">
        <div className="h-32 bg-gradient-to-r from-[var(--bg3)] to-[var(--bg2)]" />
        <div className="px-6 pb-6 relative">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] p-1 absolute -top-12 border-4 border-[var(--card)]">
            <div className="w-full h-full rounded-xl bg-[var(--bg2)] flex items-center justify-center font-heading text-3xl font-black text-white">
              {initial}
            </div>
          </div>
          <div className="ml-32 pt-3 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-heading font-black text-white">{username}</h1>
              <p className="text-[13px] text-[var(--text3)]">{user.email}</p>
            </div>
            <button 
              onClick={async () => {
                await signOut();
                setLocation('/');
              }}
              className="bg-[var(--bg3)] border border-[var(--border)] hover:border-[var(--red)] hover:text-[var(--red)] text-[var(--text2)] px-4 py-2 rounded-xl text-[12px] font-bold transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
          <h3 className="font-heading font-black text-[16px] mb-4">Account Stats</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)]">
              <span className="text-[var(--text3)] text-[13px]">Level</span>
              <span className="font-bold text-[var(--pink)]">1</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border)]">
              <span className="text-[var(--text3)] text-[13px]">Videos Submitted</span>
              <span className="font-bold text-white">0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text3)] text-[13px]">Prize Money</span>
              <span className="font-bold text-[var(--gold)]">$0</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center flex flex-col items-center justify-center">
          <div className="text-3xl mb-3 opacity-50">⚙️</div>
          <h3 className="font-heading font-black text-[16px] mb-2">Settings</h3>
          <p className="text-[12px] text-[var(--text3)] mb-4">Manage your profile and preferences.</p>
          <button className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white px-4 py-2 rounded-xl text-[12px] font-bold hover:bg-white/5 transition-colors">
            Edit Profile
          </button>
        </div>
      </div>
    </div>
  );
}
