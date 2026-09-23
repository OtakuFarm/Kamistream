import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

/* ── Dismiss the build-time prerendered shell ─────────────────────────
 * scripts/prerender.mjs writes a static, crawlable copy of each page's
 * content into #seo-shell (see that file for the why). React does not own
 * that node, so once the app has actually painted we fade it out and
 * remove it. It is position:fixed and therefore out of normal flow, so
 * removing it causes no layout shift.
 *
 * If the JS bundle never boots (offline, blocked, old browser) the shell
 * simply stays visible — the visitor still sees real content and working
 * links instead of a blank page.
 * ------------------------------------------------------------------ */
function dismissSeoShell() {
  const shell = document.getElementById('seo-shell');
  if (!shell) return;

  const rootEl    = document.getElementById('root');
  const startedAt = Date.now();

  const check = () => {
    // Wait for React's first commit, but never block the app for more than
    // 1.5s — a slow Jikan call must not leave the overlay covering the UI.
    const painted = !!rootEl && rootEl.childElementCount > 0;
    if (painted || Date.now() - startedAt > 1500) {
      shell.classList.add('ks-out');
      window.setTimeout(() => shell.remove(), 260);
    } else {
      requestAnimationFrame(check);
    }
  };

  requestAnimationFrame(check);
}

dismissSeoShell();

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
