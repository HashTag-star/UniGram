import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

/** Upload any local file URI to a Supabase storage bucket. Returns the public URL. */
export async function uploadFile(
  bucket: string,
  path: string,
  localUri: string,
  mimeType?: string,
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = mimeType ?? (
    ['mp4', 'mov', 'avi', 'webm'].includes(ext) ? `video/${ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`
  );
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, decode(base64), { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
