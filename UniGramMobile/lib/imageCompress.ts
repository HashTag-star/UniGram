/**
 * Resize/compress images before upload (max ~1440px, JPEG q≈0.75).
 * expo-image-manipulator is loaded defensively so the app still builds/runs without it
 * (then the original file is uploaded untouched).
 */
import { Image } from 'react-native';

const MAX_DIM = 1440;
const QUALITY = 0.75;

export interface CompressedImage {
  uri: string;
  /** True when `uri` is a new temp file the caller should delete after upload. */
  isTemp: boolean;
  mimeType: string;
  ext: string;
}

function getSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    try {
      Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
    } catch { resolve(null); }
  });
}

export async function compressImageForUpload(
  uri: string,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<CompressedImage | null> {
  const maxDim = opts.maxDim ?? MAX_DIM;
  const quality = opts.quality ?? QUALITY;
  const lower = uri.split('?')[0].toLowerCase();
  // Animated GIFs and SVGs must not be re-encoded.
  if (lower.endsWith('.gif') || lower.endsWith('.svg')) return null;
  let M: any;
  try { M = require('expo-image-manipulator'); } catch { return null; }
  if (!M?.manipulateAsync) return null;

  try {
    const size = await getSize(uri);
    const actions: any[] = [];
    if (size && Math.max(size.width, size.height) > maxDim) {
      actions.push({ resize: size.width >= size.height ? { width: maxDim } : { height: maxDim } });
    }
    const isAlreadyJpeg = /\.jpe?g$/.test(lower);
    // Small JPEGs that need no resize aren't worth a re-encode.
    if (actions.length === 0 && isAlreadyJpeg) return null;
    const res = await M.manipulateAsync(uri, actions, {
      compress: quality,
      format: M.SaveFormat?.JPEG ?? 'jpeg',
    });
    return { uri: res.uri, isTemp: true, mimeType: 'image/jpeg', ext: 'jpg' };
  } catch {
    return null; // fall back to the original file
  }
}
