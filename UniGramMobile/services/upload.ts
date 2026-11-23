import { supabase, getPublicMediaUrl } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { compressImageForUpload } from '../lib/imageCompress';

/** Videos larger than this are rejected up-front (a 150MB+ upload will not survive mobile data). */
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
/** Optional soft cap on duration (seconds) used by assertVideoWithinLimits when a duration is supplied. */
export const MAX_VIDEO_SECONDS = 180;

const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'webm', 'm4v'];

/**
 * Size/duration gate for videos. Throws an Error whose message is already user-friendly.
 * `durationSec` is optional (pass the picker's asset.duration; ms values > 10000 are normalised).
 */
export async function assertVideoWithinLimits(uri: string, durationSec?: number): Promise<void> {
  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    if (info?.exists && typeof info.size === 'number' && info.size > MAX_VIDEO_BYTES) {
      throw new Error(`That video is too large (${Math.round(info.size / 1048576)}MB). Please choose one under ${Math.round(MAX_VIDEO_BYTES / 1048576)}MB.`);
    }
  } catch (e: any) {
    if (/too large/.test(e?.message ?? '')) throw e;
  }
  if (durationSec && durationSec > 0) {
    const secs = durationSec > 10_000 ? durationSec / 1000 : durationSec; // ImagePicker gives ms
    if (secs > MAX_VIDEO_SECONDS) {
      throw new Error(`That video is too long. Please choose one under ${Math.round(MAX_VIDEO_SECONDS / 60)} minutes.`);
    }
  }
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function removeQuietly(uri: string) {
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

/**
 * Streams the file straight from disk to Supabase Storage (native multipart-free binary upload).
 * No base64 / ArrayBuffer copy in JS memory, so large videos can't OOM the app.
 */
async function nativeUpload(bucket: string, path: string, fileUri: string, contentType: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const url = `${base}/storage/v1/object/${bucket}/${encodePath(path)}`;
  const res = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': 'max-age=3600',
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (HTTP ${res.status})`);
  }
}

/** Upload any local file URI (file:// or content://) to Supabase storage. Returns public URL. */
export async function uploadFile(
  bucket: string,
  path: string,
  localUri: string,
  mimeType?: string,
  opts: { compress?: boolean } = {},
): Promise<string> {
  let fileUri = localUri;
  const temps: string[] = [];

  try {
    // Android returns content:// URIs — copy to a local cache path first
    if (localUri.startsWith('content://')) {
      const e = guessExt(localUri, mimeType) ?? 'tmp';
      const tempUri = `${FileSystem.cacheDirectory}upload_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${e}`;
      await FileSystem.copyAsync({ from: localUri, to: tempUri });
      fileUri = tempUri;
      temps.push(tempUri);
    }

    let ext = guessExt(fileUri, mimeType) ?? 'jpg';
    const isVideo = VIDEO_EXTS.includes(ext) || (mimeType?.startsWith('video/') ?? false);
    let contentType = mimeType ?? (isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    let finalPath = path;

    if (isVideo) {
      await assertVideoWithinLimits(fileUri);
    } else if (opts.compress !== false && (!mimeType || mimeType.startsWith('image/'))) {
      const c = await compressImageForUpload(fileUri);
      if (c) {
        fileUri = c.uri;
        temps.push(c.uri);
        contentType = c.mimeType;
        if (ext !== 'jpg' && ext !== 'jpeg') {
          // Keep the stored object's extension honest (HEIC/PNG were re-encoded as JPEG).
          finalPath = path.replace(/\.[A-Za-z0-9]{2,5}$/, '') + '.jpg';
          ext = 'jpg';
        }
      }
    }

    try {
      await nativeUpload(bucket, finalPath, fileUri, contentType);
    } catch (nativeErr) {
      // Fallback: the legacy in-memory path (slower, 2-3x RAM) — only if the streamed upload failed.
      try {
        const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
        const arrayBuffer = decode(base64);
        const { error } = await supabase.storage
          .from(bucket)
          .upload(finalPath, arrayBuffer, { contentType, upsert: true });
        if (error) throw new Error(`Upload failed: ${error.message}`);
      } catch (fallbackErr) {
        throw fallbackErr instanceof Error ? fallbackErr : nativeErr;
      }
    }

    return getPublicMediaUrl(bucket, finalPath);
  } finally {
    // Remove temp copies (content:// copies, compressed images) — they otherwise pile up in cache.
    for (const t of temps) removeQuietly(t);
  }
}

function guessExt(uri: string, mimeType?: string): string | undefined {
  if (mimeType) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
    };
    if (map[mimeType]) return map[mimeType];
  }
  const parts = uri.split('?')[0].split('.');
  if (parts.length > 1) {
    const raw = parts.pop()!.toLowerCase();
    if (raw.length <= 5) return raw;
  }
  return undefined;
}
