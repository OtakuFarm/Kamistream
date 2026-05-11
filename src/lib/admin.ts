// ⚠️  CLIENT-SIDE ONLY — this is UI gating, not a security boundary.
// All admin actions MUST also be protected by Supabase Row Level Security policies
// so that even direct API calls from non-admin users are rejected server-side.
//
// To avoid exposing personal emails in source, move this list to an env var:
//   VITE_ADMIN_EMAILS=admin@kamistream.tv,other@example.com
const rawAdminEmails = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;

export const ADMIN_EMAILS: string[] = rawAdminEmails
  ? rawAdminEmails.split(',').map(e => e.trim().toLowerCase())
  : ['admin@kamistream.tv'];

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
