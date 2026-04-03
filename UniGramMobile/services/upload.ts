import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/** Upload any local file URI (file:// or content://) to Supabase storage. Returns public URL. */
export async function uploadFile(
  bucket: string,
  path: string,
  localUri: string,
  mimeType?: string,
): Promise<string> {
  let fileUri = localUri;

  // Android returns content:// URIs — copy to a local cache path first
  if (localUri.startsWith('content://')) {
    const ext = guessExt(localUri, mimeType) ?? 'tmp';
    const tempUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: localUri, to: tempUri });
    fileUri = tempUri;
  }

  const ext = guessExt(fileUri, mimeType) ?? 'jpg';
  const isVideo = ['mp4', 'mov', 'avi', 'webm', 'm4v'].includes(ext);
  const contentType = mimeType ?? (isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`);

  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const arrayBuffer = decode(base64);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, { contentType, upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
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
