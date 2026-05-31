import React from 'react';
import { useSEO } from '@/hooks/useSEO';
import { FileText } from 'lucide-react';

export default function Terms() {
  useSEO({ title: 'Terms of Service', description: 'Terms of service for KamiStream.' });
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 pb-20">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-6 h-6 text-[var(--pink)]" />
        <h1 className="text-[24px] font-heading font-black text-white">Terms of Service</h1>
      </div>
      <div className="space-y-6 text-[13px] text-[var(--text2)] leading-relaxed">
        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By accessing and using KamiStream (kamistream.fun), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use our service.',
          },
          {
            title: '2. Service Description',
            body: 'KamiStream is a free anime streaming index that embeds content from third-party servers. We do not host, store, or distribute any video files ourselves. All content is provided by external sources that are not affiliated with KamiStream.',
          },
          {
            title: '3. Use of Service',
            body: 'You agree to use KamiStream only for lawful purposes and in a manner that does not infringe the rights of others. You must not attempt to gain unauthorized access to any part of the service, use automated tools to scrape content, or circumvent any security measures.',
          },
          {
            title: '4. Intellectual Property',
            body: 'All anime titles, characters, and related content are the property of their respective copyright holders. KamiStream makes no claim of ownership over any third-party content. If you believe content violates your copyright, please refer to our DMCA policy.',
          },
          {
            title: '5. Disclaimer of Warranties',
            body: 'KamiStream is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that video content will always be available. Third-party embed sources may go offline at any time.',
          },
          {
            title: '6. Limitation of Liability',
            body: 'KamiStream shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use or inability to use the service, including but not limited to damages for loss of data or profits.',
          },
          {
            title: '7. Changes to Terms',
            body: 'We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of the service constitutes acceptance of the updated terms.',
          },
          {
            title: '8. Contact',
            body: 'For questions about these terms, contact us at: contact@kamistream.fun',
          },
        ].map(({ title, body }) => (
          <section key={title}>
            <h2 className="text-[15px] font-black text-white mb-2">{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
