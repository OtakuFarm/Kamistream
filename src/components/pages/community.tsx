import React from 'react';

export default function Community() {
  return (
    <div className="p-4 md:p-8 pb-20">
      <h1 className="text-2xl font-heading font-black text-white mb-6">Creator Community</h1>
      
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center max-w-xl mx-auto mt-10">
        <div className="text-4xl mb-4 opacity-50">👥</div>
        <h2 className="text-xl font-heading font-black text-white mb-2">Community growing</h2>
        <p className="text-[14px] text-[var(--text3)]">Creator profiles will appear here soon.</p>
      </div>
    </div>
  );
}
