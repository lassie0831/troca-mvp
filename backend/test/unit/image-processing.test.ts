import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { InvalidImageError, processPhoto } from '../../src/storage/image-processing.js';

/** Builds a JPEG carrying GPS coordinates in its EXIF block, like a phone photo. */
async function jpegWithGps(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3a7' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' } })
    .toBuffer();
}

describe('processPhoto', () => {
  it('strips EXIF (incl. GPS) and re-encodes to bounded WebP', async () => {
    const input = await jpegWithGps(3000, 2000);
    assert.ok((await sharp(input).metadata()).exif, 'fixture should contain EXIF');

    const out = await processPhoto(input);
    const fullMeta = await sharp(out.full).metadata();
    const thumbMeta = await sharp(out.thumb).metadata();

    assert.equal(fullMeta.format, 'webp');
    assert.equal(fullMeta.exif, undefined);
    assert.equal(thumbMeta.exif, undefined);
    assert.equal(Math.max(out.width, out.height), 1600);
    assert.equal(thumbMeta.width, 400);
  });

  it('does not upscale small images', async () => {
    const out = await processPhoto(await jpegWithGps(320, 240));
    assert.deepEqual([out.width, out.height], [320, 240]);
  });

  it('rejects non-images', async () => {
    await assert.rejects(processPhoto(Buffer.from('definitely not an image')), InvalidImageError);
  });
});
