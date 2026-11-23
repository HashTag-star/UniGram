// Bakes an "AI GENERATED" badge into the bottom-right corner of an image (pure pixel drawing:
// no fonts to download). Used for every image Hashtag AI creates or edits.
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

// 5x7 bitmap glyphs for the letters we need.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

const WHITE = Image.rgbaToColor(255, 255, 255, 255)
const PILL = Image.rgbaToColor(10, 10, 14, 200)

function fillRect(img: Image, x: number, y: number, w: number, h: number, color: number) {
  const x0 = Math.max(1, Math.floor(x)), y0 = Math.max(1, Math.floor(y))
  const x1 = Math.min(img.width, Math.ceil(x + w)), y1 = Math.min(img.height, Math.ceil(y + h))
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) img.setPixelAt(xx, yy, color)
}

/** Returns a JPEG with the badge drawn on it. Falls back to the original bytes if anything fails. */
export async function addAiWatermark(bytes: Uint8Array, label = 'AI GENERATED'): Promise<Uint8Array> {
  try {
    const img = (await Image.decode(bytes)) as Image
    // Scale the badge to the picture so it is readable but not obnoxious.
    const scale = Math.max(2, Math.round(img.width / 190))
    const gap = scale          // space between letters
    const glyphW = 5 * scale
    const textW = label.length * glyphW + (label.length - 1) * gap
    const textH = 7 * scale
    const padX = Math.round(scale * 4), padY = Math.round(scale * 2.5)
    const boxW = textW + padX * 2, boxH = textH + padY * 2
    const margin = Math.round(scale * 4)
    const boxX = img.width - boxW - margin, boxY = img.height - boxH - margin
    if (boxX < 0 || boxY < 0) return bytes

    // Rounded dark pill (corners cut by radius).
    const r = Math.round(boxH / 2)
    for (let yy = 0; yy < boxH; yy++) {
      for (let xx = 0; xx < boxW; xx++) {
        const cx = xx < r ? r : xx > boxW - r ? boxW - r : xx
        const cy = r
        const dx = xx - cx, dy = yy - cy
        if (dx * dx + dy * dy <= r * r) img.setPixelAt(boxX + xx + 1, boxY + yy + 1, PILL)
      }
    }
    // Text
    let cursor = boxX + padX
    for (const ch of label) {
      const g = GLYPHS[ch] ?? GLYPHS[' ']
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === '1') fillRect(img, cursor + col * scale, boxY + padY + row * scale, scale, scale, WHITE)
        }
      }
      cursor += glyphW + gap
    }
    return await img.encodeJPEG(92)
  } catch (e) {
    console.error('[watermark] failed, returning original', (e as Error).message)
    return bytes
  }
}

/** Downscale big phone photos before sending them to a model (smaller, faster, within limits). */
export async function shrinkForModel(bytes: Uint8Array, maxSide = 1280): Promise<{ bytes: Uint8Array; mime: string }> {
  try {
    if (bytes.length <= 1_200_000) return { bytes, mime: 'image/jpeg' }
    const img = (await Image.decode(bytes)) as Image
    const longest = Math.max(img.width, img.height)
    if (longest > maxSide) {
      const k = maxSide / longest
      img.resize(Math.round(img.width * k), Math.round(img.height * k))
    }
    return { bytes: await img.encodeJPEG(88), mime: 'image/jpeg' }
  } catch (e) {
    console.error('[shrink] failed', (e as Error).message)
    return { bytes, mime: 'image/jpeg' }
  }
}
