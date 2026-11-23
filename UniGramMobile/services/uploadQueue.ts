/**
 * Persistent retry queue for posts / reels / stories (anything that uploads media then writes a row).
 *
 * Usage (UI):
 *   import { enqueueUpload, listPendingUploads, retryUpload, subscribeUploadQueue, startUploadQueue } from '../services/uploadQueue';
 *
 *   startUploadQueue();                      // once, at app start (idempotent) – retries on reconnect / foreground
 *   try { await createPost(...) } catch (e) {
 *     await enqueueUpload('post', { userId, caption, type, mediaUris, extras });   // save it, retry later
 *   }
 *   const jobs = await listPendingUploads(); // [{ id, kind, status: 'pending'|'running'|'failed', attempts, nextAttemptAt, lastError }]
 *   await retryUpload(id);                   // manual "Retry" button
 *   const off = subscribeUploadQueue(() => refresh());
 *
 * Notes
 *  - Jobs live in AsyncStorage (`ug_upload_queue`) so they survive app restarts.
 *  - Retries use exponential backoff (5s, 10s, 20s … capped at 5 min) and stop after MAX_ATTEMPTS
 *    (status 'failed' — only an explicit retryUpload() / retryAllUploads() restarts them).
 *  - Local file URIs (file://) must still exist when the retry runs. Picker/camera cache files normally
 *    survive a restart; if one was purged the job fails with a friendly message instead of looping.
 *  - Custom job kinds: registerUploadHandler('mykind', async (payload) => { ... }) — throw to signal failure.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { friendlyError } from '../lib/friendlyError';
import { isOnline } from '../lib/netStatus';

const KEY = 'ug_upload_queue';
export const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;
const MAX_JOBS = 25;

export type UploadJobKind = 'post' | 'reel' | 'story' | (string & {});

export interface UploadJob {
  id: string;
  kind: UploadJobKind;
  payload: any;
  status: 'pending' | 'running' | 'failed';
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  lastError?: string;
}

type Handler = (payload: any) => Promise<any>;
const handlers = new Map<string, Handler>();
const listeners = new Set<() => void>();

let jobs: UploadJob[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
let started = false;
let draining = false;
let timer: ReturnType<typeof setTimeout> | null = null;

// ── built-in handlers (lazy requires avoid import cycles) ────────────────────
handlers.set('post', async (p) => {
  const { createPost } = require('./posts');
  return createPost(p.userId, p.caption ?? '', p.type ?? 'thread', p.mediaUris, p.extras);
});
handlers.set('reel', async (p) => {
  const { createReel } = require('./reels');
  return createReel(p.userId, p.videoUri, p.caption ?? '', p.song, p.thumbnailUri);
});
handlers.set('story', async (p) => {
  const { createStory } = require('./stories');
  return createStory(p.userId, p.mediaUri, p.caption, p.linkUrl);
});

export function registerUploadHandler(kind: string, handler: Handler) {
  handlers.set(kind, handler);
}

// ── persistence ──────────────────────────────────────────────────────────────
function emit() { listeners.forEach(l => { try { l(); } catch {} }); }

async function load() {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed: UploadJob[] = raw ? JSON.parse(raw) : [];
        // A job left 'running' by a killed app is simply pending again.
        jobs = parsed.map(j => (j.status === 'running' ? { ...j, status: 'pending' as const } : j));
      } catch { jobs = []; }
      loaded = true;
    })();
  }
  await loading;
}

async function save() {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(jobs)); } catch {}
  emit();
}

function backoff(attempts: number) {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1)));
}

async function missingLocalFile(payload: any): Promise<boolean> {
  const uris: string[] = [
    ...(Array.isArray(payload?.mediaUris) ? payload.mediaUris : []),
    payload?.videoUri, payload?.thumbnailUri, payload?.mediaUri,
  ].filter((u: any) => typeof u === 'string' && u.startsWith('file://'));
  for (const u of uris) {
    try { if (!(await FileSystem.getInfoAsync(u)).exists) return true; } catch { return true; }
  }
  return false;
}

// ── public API ───────────────────────────────────────────────────────────────

/** Saves a job and (if online) starts working through the queue. Returns the job id. */
export async function enqueueUpload(kind: UploadJobKind, payload: any): Promise<string> {
  await load();
  const job: UploadJob = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now() + 2_000,
  };
  jobs.push(job);
  if (jobs.length > MAX_JOBS) jobs = jobs.slice(-MAX_JOBS);
  await save();
  scheduleDrain();
  return job.id;
}

export async function listPendingUploads(): Promise<UploadJob[]> {
  await load();
  return jobs.map(j => ({ ...j }));
}

/** Manual retry (also revives a 'failed' job). Resolves true when the job completed. */
export async function retryUpload(id: string): Promise<boolean> {
  await load();
  const job = jobs.find(j => j.id === id);
  if (!job) return false;
  job.status = 'pending';
  job.attempts = Math.min(job.attempts, MAX_ATTEMPTS - 1);
  job.nextAttemptAt = 0;
  await save();
  return runJob(job);
}

export async function retryAllUploads(): Promise<void> {
  await load();
  jobs.forEach(j => { if (j.status === 'failed') { j.status = 'pending'; j.attempts = Math.min(j.attempts, MAX_ATTEMPTS - 1); } j.nextAttemptAt = 0; });
  await save();
  await drain();
}

export async function removeUpload(id: string): Promise<void> {
  await load();
  jobs = jobs.filter(j => j.id !== id);
  await save();
}

/** Sign-out / account switch: queued jobs belong to the previous account. */
export async function clearUploadQueue(): Promise<void> {
  jobs = [];
  loaded = true;
  await save();
}

export function subscribeUploadQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ── engine ───────────────────────────────────────────────────────────────────
async function runJob(job: UploadJob): Promise<boolean> {
  if (job.status === 'running') return false;
  const handler = handlers.get(job.kind);
  if (!handler) {
    job.status = 'failed';
    job.lastError = 'This item can no longer be sent.';
    await save();
    return false;
  }
  if (await missingLocalFile(job.payload)) {
    job.status = 'failed';
    job.lastError = 'The photo or video is no longer on this device. Please create the post again.';
    await save();
    return false;
  }
  job.status = 'running';
  job.attempts += 1;
  await save();
  try {
    await handler(job.payload);
    jobs = jobs.filter(j => j.id !== job.id);
    await save();
    return true;
  } catch (e) {
    job.lastError = friendlyError(e);
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = 'failed';
    } else {
      job.status = 'pending';
      job.nextAttemptAt = Date.now() + backoff(job.attempts);
    }
    await save();
    return false;
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    await load();
    if (!isOnline()) return;
    for (const job of [...jobs]) {
      if (job.status !== 'pending' || job.nextAttemptAt > Date.now()) continue;
      const ok = await runJob(job);
      if (!ok && !isOnline()) break;
    }
  } finally {
    draining = false;
    scheduleNext();
  }
}

function scheduleDrain(delay = 500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; drain().catch(() => {}); }, delay);
}

function scheduleNext() {
  const pending = jobs.filter(j => j.status === 'pending');
  if (!pending.length) return;
  const next = Math.min(...pending.map(j => j.nextAttemptAt));
  scheduleDrain(Math.max(1_000, next - Date.now()));
}

/** Idempotent. Retries queued jobs on reconnect, on app foreground and on backoff timers. */
export function startUploadQueue() {
  if (started) return;
  started = true;
  DeviceEventEmitter.addListener('app_online', () => {
    // Reconnected: forget backoff so queued items go out immediately.
    jobs.forEach(j => { if (j.status === 'pending') j.nextAttemptAt = 0; });
    scheduleDrain(500);
  });
  AppState.addEventListener('change', (s) => { if (s === 'active') scheduleDrain(500); });
  load().then(() => scheduleDrain(2_000));
}
