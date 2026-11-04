// The portrait and symbol as the app keeps them: scaled down so a character stays small in the browser's
// storage and in backups (a phone photo is several megabytes; the Profile tab shows the portrait about
// 150 pixels wide). A picture with see-through parts stays a PNG; anything else becomes a JPEG.
import type { SheetImage, SheetImages } from '../engine/types.ts';

/** The long side of the picture the Profile tab shows (twice its size there, for sharp screens). */
export const PICTURE_SIZE = 640;
/** The long side of the character list's small picture. */
const THUMB_SIZE = 160;
const JPEG_QUALITY = 0.85;
/**
 * Below this alpha a pixel counts as see-through. Not 255: WebKit's smooth downscaling leaves the edge pixels
 * of an opaque photo at 254, which would make every photo a PNG about six times the size of the JPEG.
 */
const SEE_THROUGH = 250;
/** RGBA: the alpha byte is every fourth. */
const RGBA = 4;
const ALPHA = 3;

/**
 * A picture the app made itself: a JPEG or PNG data URL. Only these are shown, since a restored backup
 * could hold anything: matches "data:image/png;base64,iVBOR…", not "data:image/svg+xml,…". Try it:
 * https://regex101.com/?regex=%5Edata%3Aimage%5C%2F(jpeg%7Cpng)%3Bbase64%2C&testString=data%3Aimage%2Fpng%3Bbase64%2CiVBOR
 */
export const SAFE_PICTURE = /^data:image\/(jpeg|png);base64,/;

/** The size that fits `max` on the long side, never larger than the picture. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

/** A canvas of this size: OffscreenCanvas where the browser has it, a page canvas otherwise. */
function canvasOf(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function blobOf(canvas: Canvas, type: string): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), type, JPEG_QUALITY),
  );
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('could not read the image')));
    reader.readAsDataURL(blob);
  });
}

/** Whether any of these RGBA pixels lets the background through. */
export function seeThroughPixels(data: Uint8ClampedArray): boolean {
  return Array.from({ length: data.length / RGBA }, (_, i) => data[i * RGBA + ALPHA] ?? SEE_THROUGH).some(
    (alpha) => alpha < SEE_THROUGH,
  );
}

function seeThrough(canvas: Canvas): boolean {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const data = context?.getImageData(0, 0, canvas.width, canvas.height).data;
  return data ? seeThroughPixels(data) : false;
}

async function scaled(bitmap: ImageBitmap, max: number): Promise<string> {
  const { width, height } = fitSize(bitmap.width, bitmap.height, max);
  const canvas = canvasOf(width, height);
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('This browser cannot draw the image.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return readAsDataUrl(await blobOf(canvas, seeThrough(canvas) ? 'image/png' : 'image/jpeg'));
}

/** A picture file (or an image from a PDF) as the app keeps it. Throws when the browser can't read it. */
export async function fitPicture(file: Blob): Promise<SheetImage> {
  const bitmap = await createImageBitmap(file);
  try {
    return { src: await scaled(bitmap, PICTURE_SIZE), thumb: await scaled(bitmap, THUMB_SIZE) };
  } finally {
    bitmap.close();
  }
}

/** "data:image/png;base64,…" as a Blob. (fetch() would do it, but the site's CSP keeps fetch to itself.) */
export function blobOfDataUrl(url: string): Blob {
  const comma = url.indexOf(',');
  const type = url.slice('data:'.length, url.indexOf(';'));
  const binary = atob(url.slice(comma + 1));
  return new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type });
}

/**
 * An imported PDF's pictures, fitted. The PDF's own picture can be large (a portrait of 1308 × 1273
 * pixels is 2.4 MB as a PNG). One the browser can't read is left out rather than failing the import.
 */
export async function fitImages(images: SheetImages | undefined): Promise<SheetImages | undefined> {
  if (!images) return undefined;
  const fitted: SheetImages = {};
  await Promise.all(
    Object.entries(images).map(async ([slot, image]) => {
      try {
        fitted[slot as keyof SheetImages] = await fitPicture(blobOfDataUrl(image.src));
      } catch {
        // Left out: the player can still pick a picture on the Profile tab.
      }
    }),
  );
  return Object.keys(fitted).length ? fitted : undefined;
}
