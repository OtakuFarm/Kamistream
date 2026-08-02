import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Debug overlay (opt-in via ?debug=1) ─────────────────────────────────
// Mobile browsers make it hard to see console errors. This surfaces any
// JS error or unhandled promise rejection directly on the page so you can
// screenshot it. Remove once the data-loading issue is found.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:50vh;overflow:auto;background:#7f1d1d;color:#fff;font:11px monospace;padding:8px;z-index:999999;white-space:pre-wrap;';
  box.textContent = '[Debug overlay active — waiting for errors]';
  document.body.appendChild(box);
  let count = 0;
  function log(label: string, msg: string) {
    count++;
    if (count === 1) box.textContent = '';
    box.textContent += `#${count} ${label}: ${msg}\n\n`;
  }
  window.addEventListener('error', (e) => log('JS Error', `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => log('Unhandled Promise Rejection', String(e.reason?.message || e.reason)));
}

createRoot(document.getElementById("root")!).render(<App />);

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
