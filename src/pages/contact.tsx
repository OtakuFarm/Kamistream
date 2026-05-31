import React, { useState } from 'react';
import { useSEO } from '@/hooks/useSEO';
import { Mail, MessageSquare, Send } from 'lucide-react';

export default function Contact() {
  useSEO({ title: 'Contact', description: 'Get in touch with KamiStream.' });
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Opens mail client as fallback — replace with a real form service like Formspree if needed
    const mailto = `mailto:contact@kamistream.fun?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`)}`;
    window.open(mailto);
    setSent(true);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 pb-20">
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="w-6 h-6 text-[var(--pink)]" />
        <h1 className="text-[24px] font-heading font-black text-white">Contact Us</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[
          { icon: Mail, label: 'General', value: 'contact@kamistream.fun' },
          { icon: Mail, label: 'DMCA',    value: 'dmca@kamistream.fun' },
        ].map(({ icon: Icon, label, value }) => (
          <a key={label} href={`mailto:${value}`}
            className="flex items-center gap-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl hover:border-[var(--pink)]/40 transition-all group">
            <div className="w-10 h-10 bg-[var(--pink)]/15 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[var(--pink)]/25 transition-colors">
              <Icon className="w-4 h-4 text-[var(--pink)]" />
            </div>
            <div>
              <p className="text-[10px] font-black text-[var(--text3)] uppercase tracking-widest">{label}</p>
              <p className="text-[12px] font-bold text-white">{value}</p>
            </div>
          </a>
        ))}
      </div>

      {sent ? (
        <div className="bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-2xl p-6 text-center">
          <p className="text-[var(--green)] font-black text-[15px] mb-1">Message sent! ✓</p>
          <p className="text-[12px] text-[var(--text3)]">We'll get back to you within 48 hours.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'name',  label: 'Your Name',     placeholder: 'Naruto Uzumaki', type: 'text' },
              { key: 'email', label: 'Email Address',  placeholder: 'you@example.com', type: 'email' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">{label}</label>
                <input
                  type={type} required placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] transition-colors"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Subject</label>
            <input
              type="text" required placeholder="What's this about?"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Message</label>
            <textarea
              required rows={5} placeholder="Tell us what's on your mind..."
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] transition-colors resize-none"
            />
          </div>
          <button type="submit"
            className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-black py-3 rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--pink)]/20">
            <Send className="w-4 h-4" /> Send Message
          </button>
        </form>
      )}
    </div>
  );
}
