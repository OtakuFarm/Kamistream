import React, { useState } from 'react';
import { X, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Week } from '@/hooks/useChallenge';

interface UploadModalProps {
  week: Week;
  onClose: () => void;
  onUploaded: () => void;
}

const MAX_BYTES = 80 * 1024 * 1024; // 80 MB

export function UploadModal({ week, onClose, onUploaded }: UploadModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const username =
    (user?.user_metadata as any)?.username ||
    user?.email?.split('@')[0] ||
    'creator';

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      toast.error('Please pick a video file');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`Max file size is ${(MAX_BYTES / 1024 / 1024) | 0} MB`);
      return;
    }
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to submit');
      return;
    }
    if (!file) {
      toast.error('Pick a video first');
      return;
    }
    setBusy(true);
    try {
      setProgress('Uploading video…');
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const path = `${user.id}/${week.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('submissions')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('submissions').getPublicUrl(path);

      setProgress('Saving entry…');
      const { error: insErr } = await supabase.from('submissions').insert({
        user_id: user.id,
        week_id: week.id,
        username,
        caption: caption.trim() || null,
        video_url: publicUrl,
      });
      if (insErr) throw insErr;

      toast.success('Submission posted! Good luck.');
      onUploaded();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg hover:bg-[var(--bg3)] flex items-center justify-center text-[var(--text3)]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <div className="text-[10px] font-black tracking-[2px] text-[var(--pink)] uppercase">
            Submit to
          </div>
          <h2 className="font-heading font-black text-xl text-white">{week.theme}</h2>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label
            className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              file
                ? 'border-[var(--pink)] bg-[var(--pink)]/5'
                : 'border-[var(--border)] hover:border-[var(--purple)]'
            }`}
          >
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => onPick(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="space-y-1">
                <Video className="w-8 h-8 mx-auto text-[var(--pink)]" />
                <div className="text-[13px] font-bold text-white truncate">
                  {file.name}
                </div>
                <div className="text-[11px] text-[var(--text3)]">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-8 h-8 mx-auto text-[var(--text3)]" />
                <div className="text-[13px] font-bold text-white">Pick a video</div>
                <div className="text-[11px] text-[var(--text3)]">
                  MP4, WebM or MOV · max 80 MB
                </div>
              </div>
            )}
          </label>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            rows={2}
            maxLength={280}
            className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] resize-none"
          />

          {progress && (
            <div className="text-[12px] text-[var(--text3)] text-center">{progress}</div>
          )}

          <button
            type="submit"
            disabled={busy || !file}
            className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white py-3 rounded-xl text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Submitting…' : 'Submit Entry'}
          </button>
        </form>
      </div>
    </div>
  );
}
