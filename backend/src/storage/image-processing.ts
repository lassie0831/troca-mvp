import sharp, { type Sharp } from 'sharp';

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  contentType: 'image/webp';
}

export class InvalidImageError extends Error {}

/**
 * Normalises an uploaded photo:
 * - applies the EXIF orientation, then DROPS all metadata — phone photos carry GPS coordinates in EXIF,
 *   which would leak the user's exact address and defeat the location fuzzing;
 * - bounds the size (1600 px full, 400 px thumbnail) and re-encodes as WebP.
 * Decoding also validates that the file really is an image (the declared MIME type is not trusted).
 */
export async function processPhoto(input: Buffer): Promise<ProcessedImage> {
  let base: Sharp;
  try {
    base = sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate();
    const meta = await base.metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif'].includes(meta.format)) {
      throw new InvalidImageError(`Unsupported image format: ${meta.format ?? 'unknown'}`);
    }
  } catch (err) {
    if (err instanceof InvalidImageError) throw err;
    throw new InvalidImageError('File is not a valid image');
  }

  const { data: full, info } = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: 400, height: 400, fit: 'cover' })
    .webp({ quality: 70 })
    .toBuffer();

  return { full, thumb, width: info.width, height: info.height, contentType: 'image/webp' };
}

export const thumbKey = (storageKey: string) => storageKey.replace(/\.webp$/, '_thumb.webp');
