import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// ── useSocial ─────────────────────────────────────────────────────
// Handles follow/unfollow and follower counts.
// Tables needed in Supabase:
//
//   user_follows (
//     id         uuid primary key default gen_random_uuid(),
//     follower_id uuid references auth.users(id) on delete cascade,
//     following_id uuid references auth.users(id) on delete cascade,
//     created_at  timestamptz default now(),
//     unique(follower_id, following_id)
//   );
//
//   user_profiles (
//     id          uuid primary key references auth.users(id) on delete cascade,
//     username    text,
//     avatar_url  text,
//     bio         text,
//     updated_at  timestamptz default now()
//   );

export interface UserProfile {
  id:         string;
  username:   string;
  avatar_url: string | null;
  bio:        string | null;
  followers:  number;
  following:  number;
}

export function useSocial(targetUserId?: string) {
  const { user } = useAuth();
  const [isFollowing,     setIsFollowing]     = useState(false);
  const [followerCount,   setFollowerCount]   = useState(0);
  const [followingCount,  setFollowingCount]  = useState(0);
  const [loading,         setLoading]         = useState(false);

  // Check if current user follows target
  useEffect(() => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)
      .then(({ count }) => setIsFollowing((count ?? 0) > 0));
  }, [user?.id, targetUserId]);

  // Get counts for target user
  useEffect(() => {
    if (!targetUserId) return;
    Promise.all([
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('following_id', targetUserId),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id',  targetUserId),
    ]).then(([followers, following]) => {
      setFollowerCount(followers.count ?? 0);
      setFollowingCount(following.count ?? 0);
    });
  }, [targetUserId]);

  const follow = useCallback(async () => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    setLoading(true);
    if (isFollowing) {
      await supabase.from('user_follows').delete()
        .eq('follower_id', user.id).eq('following_id', targetUserId);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from('user_follows').insert({ follower_id: user.id, following_id: targetUserId });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);
    }
    setLoading(false);
  }, [user, targetUserId, isFollowing]);

  return { isFollowing, followerCount, followingCount, follow, loading };
}

// ── useUserProfile ────────────────────────────────────────────────
export function useUserProfile(userId?: string) {
  const { user } = useAuth();
  const [profile,  setProfile]  = useState<UserProfile | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const targetId = userId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    Promise.all([
      supabase.from('user_profiles').select('*').eq('id', targetId).maybeSingle(),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', targetId),
    ]).then(([profileRes, followersRes, followingRes]) => {
      const p = profileRes.data;
      setProfile({
        id:         targetId,
        username:   p?.username || (user?.email?.split('@')[0] ?? 'user'),
        avatar_url: p?.avatar_url || null,
        bio:        p?.bio || null,
        followers:  followersRes.count ?? 0,
        following:  followingRes.count ?? 0,
      });
      setLoading(false);
    });
  }, [targetId]);

  const updateProfile = useCallback(async (updates: Partial<Pick<UserProfile, 'username' | 'bio'>>) => {
    if (!user) return;
    setSaving(true);
    await supabase.from('user_profiles').upsert({
      id: user.id, ...updates, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    setProfile(p => p ? { ...p, ...updates } : p);
    setSaving(false);
  }, [user]);

  return { profile, loading, saving, updateProfile, isOwnProfile: targetId === user?.id };
}
