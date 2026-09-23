/* ── Analytics ────────────────────────────────────────────────────────
 * Traffic measurement for KamiStream, deliberately INERT until configured.
 *
 * Right now the site reports nothing: you cannot see which pages organic
 * visitors land on, which queries convert, or whether a Bing/Google change
 * helped. That is the difference between guessing and fixing.
 *
 * ── HOW TO TURN IT ON (no code change needed) ────────────────────────
 * Set these in Vercel → Project → Settings → Environment Variables, then
 * redeploy (Vite inlines them at build time):
 *
 *   VITE_ANALYTICS_PROVIDER = umami | plausible | ga4
 *   VITE_ANALYTICS_ID       = the site/measurement ID from the provider
 *
 * Optional:
 *   VITE_ANALYTICS_SRC      = override the script URL
 *                             (needed for self-hosted Umami/Plausible)
 *
 * If either of the first two is missing, nothing is loaded at all — no
 * broken tag, no console noise, no requests. Nothing is sent in `vite dev`
 * or `vite preview` either, so local testing never pollutes the numbers.
 *
 * ── WHICH ONE ────────────────────────────────────────────────────────
 * `umami` (cloud.umami.is, free tier) is the recommendation: cookieless,
 * no personal data, GDPR-friendly without a consent banner, and its script
 * follows SPA route changes on its own. Plausible works the same way.
 * GA4 is supported but needs the extra pageview hook below because it does
 * not track history-based navigation by itself.
 * ------------------------------------------------------------------ */

type Props = Record<string, string>;

/** Subset of import.meta.env we care about. Vite exposes these as strings. */
const env = import.meta.env as unknown as Record<string, string | undefined>;

const PROVIDER = (env.VITE_ANALYTICS_PROVIDER || '').trim().toLowerCase();
const SITE_ID  = (env.VITE_ANALYTICS_ID || '').trim();
const SCRIPT   = (env.VITE_ANALYTICS_SRC || '').trim();

/** Appends a <script> and resolves via onload/onerror. Never rejects. */
function injectScript(src: string, attrs: Props = {}): Promise<boolean> {
  return new Promise(resolve => {
    const el = document.createElement('script');
    el.async = true;      // never block rendering
    el.src = src;
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  });
}

/** GA4 needs the gtag shim + a config call; the other two are one-liners. */
function loadGa4(id: string) {
  const w = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  w.dataLayer = w.dataLayer || [];
  // Must push `arguments`-style, so use a rest parameter and push the array.
  w.gtag = (...args: unknown[]) => { w.dataLayer!.push(args); };
  w.gtag('js', new Date());
  w.gtag('config', id);

  void injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

/**
 * GA4 does not see history.pushState navigation, and wouter uses pushState —
 * without this every visit after the landing page would be invisible. Umami
 * and Plausible already handle SPA navigation internally, so hooking history
 * for them would double-count.
 */
function trackGa4RouteChanges() {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (!gtag) return;

  let last = window.location.pathname + window.location.search;
  const send = () => {
    const now = window.location.pathname + window.location.search;
    if (now === last) return;
    last = now;
    gtag('event', 'page_view', {
      page_path: now,
      page_location: window.location.href,
      page_title: document.title,
    });
  };

  // wouter only ever uses pushState/replaceState + the back/forward event,
  // so patching those three covers every in-app navigation.
  const wrap = (name: 'pushState' | 'replaceState') => {
    const original = history[name].bind(history);
    history[name] = ((...args: Parameters<History['pushState']>) => {
      const result = original(...args);
      send();
      return result;
    }) as History[typeof name];
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', send);
}

/**
 * Call once after the app has rendered. Safe to call anywhere; it is a no-op
 * unless the environment variables are configured and the build is production.
 */
export function initAnalytics(): void {
  try {
    if (!PROVIDER || !SITE_ID) return;        // not configured — silent no-op
    if (!import.meta.env.PROD) return;        // keep dev/preview out of the stats

    if (PROVIDER === 'umami') {
      void injectScript(SCRIPT || 'https://cloud.umami.is/script.js', {
        'data-website-id': SITE_ID,
      });
    } else if (PROVIDER === 'plausible') {
      void injectScript(SCRIPT || 'https://plausible.io/js/script.js', {
        'data-domain': SITE_ID,
      });
    } else if (PROVIDER === 'ga4') {
      loadGa4(SITE_ID);
      trackGa4RouteChanges();
    } else {
      console.warn(`[analytics] unknown VITE_ANALYTICS_PROVIDER "${PROVIDER}" — nothing loaded.`);
    }
  } catch (err) {
    // Measurement must never be able to break the app.
    console.warn('[analytics] failed to initialise:', err);
  }
}
