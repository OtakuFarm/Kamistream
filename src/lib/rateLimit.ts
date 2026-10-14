// ─────────────────────────────────────────────────────────────────────────────
// Shared rate-limit queue (single instance across the entire app)
// Jikan allows ~3 req/sec. This queue serialises every fetch through a
// token-bucket so multiple hooks mounting simultaneously don't blast 7+
// requests at once and trigger 429s.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_GAP_MS = 350; // ~2.8 req/sec — safely under the 3 req/sec limit
let lastRequestTime = 0;
let pendingQueue: Array<() => void> = [];
let queueRunning = false;

function runQueue() {
  if (queueRunning || pendingQueue.length === 0) return;
  queueRunning = true;
  const next = pendingQueue.shift()!;
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_GAP_MS - now);
  setTimeout(() => {
    lastRequestTime = Date.now();
    next();
    queueRunning = false;
    runQueue();
  }, wait);
}

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingQueue.push(() => fn().then(resolve).catch(reject));
    runQueue();
  });
}

export { MIN_GAP_MS };
