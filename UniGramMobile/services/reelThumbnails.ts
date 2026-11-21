/**
 * Lazily generates a poster frame for videos that have no stored thumbnail, so
 * inactive reel previews are never blank. Results are cached in memory and on
 * disk, and generation is serialised so scrolling a strip can't spawn a pile of
 * parallel decoders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

let VideoThumbnails: any = null;
try { VideoThumbnails = require('expo-video-thumbnails'); } catch {}

const KEY = 'ug_reel_thumbs:v1';
const mem = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let diskLoaded = false;
let chain: Promise<unknown> = Promise.resolve();

async function loadDisk() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) Object.entries(JSON.parse(raw) as Record<string, string>).forEach(([k, v]) => mem.set(k, v));
  } catch {}
}

function persist() {
  const obj: Record<string, string> = {};
  [...mem.entries()].slice(-80).forEach(([k, v]) => { obj[k] = v; });
  AsyncStorage.setItem(KEY, JSON.stringify(obj)).catch(() => {});
}

export function getCachedReelThumbnail(videoUrl?: string | null): string | null {
  return videoUrl ? mem.get(videoUrl) ?? null : null;
}

export async function getReelThumbnail(videoUrl?: string | null): Promise<string | null> {
  if (!videoUrl || !VideoThumbnails) return null;
  await loadDisk();
  const hit = mem.get(videoUrl);
  if (hit) return hit;
  const pending = inflight.get(videoUrl);
  if (pending) return pending;

  const job = (chain = chain.then(async () => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 800, quality: 0.6 });
      if (uri) { mem.set(videoUrl, uri); persist(); return uri as string; }
    } catch {}
    return null;
  })) as Promise<string | null>;
  inflight.set(videoUrl, job);
  job.finally(() => inflight.delete(videoUrl));
  return job;
}
