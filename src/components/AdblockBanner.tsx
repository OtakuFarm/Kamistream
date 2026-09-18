import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function AdblockBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('kamistream_adblock_dismissed');
    if (!dismissed) {
      // Simulate detection delay
      setTimeout(() => setShow(true), 2000);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-[var(--pink)]/20 to-[var(--purple)]/20 border-b border-[var(--pink)]/30 px-4 py-2 flex items-center justify-between z-40 relative backdrop-blur-sm">
      <div className="text-[12px] font-bold text-white flex-1 text-center sm:text-left">
        KamiStream is ad-supported — please consider whitelisting us. <span className="text-[var(--gold)]">We keep the servers running!</span>
      </div>
      <button 
        onClick={() => {
          setShow(false);
          localStorage.setItem('kamistream_adblock_dismissed', 'true');
        }}
        className="p-1 text-[var(--text3)] hover:text-white rounded-md hover:bg-white/10 transition-colors ml-4"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
