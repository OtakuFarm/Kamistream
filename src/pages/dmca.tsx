import React from 'react';
import { useSEO } from '@/hooks/useSEO';
import { Shield } from 'lucide-react';

export default function DMCA() {
  useSEO({ title: 'DMCA', description: 'DMCA takedown policy for KamiStream.' });
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 pb-20">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-6 h-6 text-[var(--pink)]" />
        <h1 className="text-[24px] font-heading font-black text-white">DMCA Policy</h1>
      </div>
      <div className="space-y-6 text-[13px] text-[var(--text2)] leading-relaxed">
        <section>
          <h2 className="text-[15px] font-black text-white mb-2">Overview</h2>
          <p>KamiStream respects the intellectual property rights of others and expects its users to do the same. KamiStream does not host, upload, or store any video files on its servers. All video content is provided by and embedded from non-affiliated third-party servers.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-black text-white mb-2">Notice & Takedown</h2>
          <p>If you are a copyright owner, or authorized to act on behalf of a copyright owner, and you believe that content available on KamiStream infringes upon your copyright, please send a DMCA notice to our designated agent with the following information:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>A description of the copyrighted work that you claim has been infringed.</li>
            <li>A description of where the infringing material is located on the site (URL).</li>
            <li>Your contact information — name, address, telephone number, and email address.</li>
            <li>A statement that you have a good faith belief that the use is not authorized by the copyright owner, its agent, or the law.</li>
            <li>A statement made under penalty of perjury that the above information is accurate, and that you are the copyright owner or authorized to act on their behalf.</li>
            <li>Your electronic or physical signature.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-[15px] font-black text-white mb-2">Response Time</h2>
          <p>We will respond to valid DMCA notices within 72 hours and will take appropriate action, which may include removing the content or disabling access to it.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-black text-white mb-2">Contact</h2>
          <p>Send DMCA notices to: <a href="mailto:dmca@kamistream.fun" className="text-[var(--pink)] hover:underline">dmca@kamistream.fun</a></p>
        </section>
      </div>
    </div>
  );
}
