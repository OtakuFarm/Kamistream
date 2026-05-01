const KEY = 'kami_ep_progress';

interface ProgressMap {
  [key: string]: number;
}

function makeKey(malId: string | number, epId: string | number) {
  return `${malId}_${epId}`;
}

function read(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(malId: string | number, epId: string | number, seconds: number) {
  const map = read();
  map[makeKey(malId, epId)] = seconds;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getProgress(malId: string | number, epId: string | number): number {
  return read()[makeKey(malId, epId)] || 0;
}

export function clearProgress(malId: string | number, epId: string | number) {
  const map = read();
  delete map[makeKey(malId, epId)];
  localStorage.setItem(KEY, JSON.stringify(map));
}
