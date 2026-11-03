// The pictures a player put on the sheet: the character portrait and the organisation symbol. In the PDF
// they are the icon of a button (the widget's /MK /I, a form XObject that draws an image). Acrobat stores a
// JPEG as it is (DCTDecode) and other images as raw pixels (FlateDecode), sometimes with a separate alpha
// mask (/SMask). Browsers show JPEG and PNG, so a JPEG is kept as it is and raw pixels become a PNG.
// A vector icon (a PDF page as the picture, or MPMB's own "click me" placeholder) has no image and is
// left out.
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from '@cantoo/pdf-lib';
import type { PDFContext, PDFObject } from '@cantoo/pdf-lib';
import { encodePng, unfilterRows, withAlpha } from './png.ts';
import type { Pixels } from './png.ts';
import type { ImageSlot } from '../engine/types.ts';

/** The sheet's button for each picture (Colorful A4: the background page, template ASbackgr). */
export const PICTURE_FIELDS: Record<ImageSlot, string> = { portrait: 'Portrait', symbol: 'Symbol' };

/** A picture as the browser shows it. */
export interface IconImage {
  type: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
}

/** Forms inside forms: MPMB's icons are one level deep; this allows for a wrapper or two. */
const MAX_FORM_DEPTH = 3;
const BITS_PER_CHANNEL = 8;
const GRAY = 1;
const RGB = 3;
/** /Predictor values from 10 on: the rows are PNG-filtered (PDF 1.7, 7.4.4.4); 2 is TIFF's. */
const PNG_PREDICTORS = 10;
const TIFF_PREDICTOR = 2;

const name = (key: string): PDFName => PDFName.of(key);

type Look = (o: PDFObject | undefined) => PDFObject | undefined;

/** The image a widget's icon draws, or null when it draws none the browser can show. */
export async function iconImage(context: PDFContext, widget: PDFDict): Promise<IconImage | null> {
  const look: Look = (o) => (o instanceof PDFRef ? context.lookup(o) : o);
  const mk = look(widget.get(name('MK')));
  if (!(mk instanceof PDFDict)) return null;
  const image = findImage(look, look(mk.get(name('I'))), 0);
  return image ? imageOf(look, image) : null;
}

/** The first image XObject a form draws, looking into forms it uses. */
function findImage(look: Look, form: PDFObject | undefined, depth: number): PDFRawStream | null {
  if (!(form instanceof PDFRawStream) || depth > MAX_FORM_DEPTH) return null;
  const resources = look(form.dict.get(name('Resources')));
  const xobjects = resources instanceof PDFDict ? look(resources.get(name('XObject'))) : undefined;
  if (!(xobjects instanceof PDFDict)) return null;
  return xobjects
    .values()
    .map(look)
    .filter((x): x is PDFRawStream => x instanceof PDFRawStream)
    .reduce<PDFRawStream | null>((found, x) => {
      if (found) return found;
      const subtype = x.dict.get(name('Subtype'));
      if (subtype === name('Image')) return x;
      return subtype === name('Form') ? findImage(look, x, depth + 1) : null;
    }, null);
}

/** A stream's filters as names: /Filter is one name or an array of names. */
function filtersOf(look: Look, stream: PDFRawStream): string[] {
  const filter = look(stream.dict.get(name('Filter')));
  if (!filter) return [];
  const list = filter instanceof PDFArray ? filter.asArray().map(look) : [filter];
  return list.map((x) => (x instanceof PDFName ? x.decodeText() : ''));
}

/** Gray (1) or colour (3) channels, from the colour space; 0 for those the app doesn't convert. */
function channelsOf(look: Look, space: PDFObject | undefined): number {
  const s = look(space);
  if (s === name('DeviceRGB')) return RGB;
  if (s === name('DeviceGray')) return GRAY;
  if (!(s instanceof PDFArray) || look(s.get(0)) !== name('ICCBased')) return 0;
  // [/ICCBased stream]: the stream's /N says how many channels.
  const profile = look(s.get(1));
  const count = profile instanceof PDFRawStream ? numberOf(look, profile.dict, 'N') : 0;
  return count === GRAY || count === RGB ? count : 0;
}

function numberOf(look: Look, dict: PDFDict, key: string): number {
  const n = look(dict.get(name(key)));
  return n instanceof PDFNumber ? n.asNumber() : 0;
}

async function imageOf(look: Look, image: PDFRawStream): Promise<IconImage | null> {
  const filters = filtersOf(look, image);
  if (filters.length === 1 && filters[0] === 'DCTDecode') return { type: 'image/jpeg', bytes: image.contents };
  const pixels = rawPixels(look, image);
  if (!pixels) return null;
  const mask = look(image.dict.get(name('SMask')));
  const alpha = mask instanceof PDFRawStream ? rawPixels(look, mask) : null;
  const fits = alpha?.channels === GRAY && alpha.width === pixels.width && alpha.height === pixels.height;
  return { type: 'image/png', bytes: await encodePng(fits ? withAlpha(pixels, alpha.data) : pixels) };
}

/** Raw 8-bit pixels of a Flate-compressed (or uncompressed) image. */
function rawPixels(look: Look, image: PDFRawStream): Pixels | null {
  const { dict } = image;
  const filters = filtersOf(look, image);
  if (!filters.every((f) => f === 'FlateDecode')) return null;
  if (numberOf(look, dict, 'BitsPerComponent') !== BITS_PER_CHANNEL) return null;
  // An alpha mask has no colour space and is gray.
  const channels = dict.has(name('ColorSpace')) ? channelsOf(look, dict.get(name('ColorSpace'))) : GRAY;
  const width = numberOf(look, dict, 'Width');
  const height = numberOf(look, dict, 'Height');
  if (!channels || width <= 0 || height <= 0) return null;
  const parms = look(dict.get(name('DecodeParms')));
  const predictor = parms instanceof PDFDict ? numberOf(look, parms, 'Predictor') : 0;
  // TIFF's predictor: not worth the code for a portrait.
  if (predictor >= TIFF_PREDICTOR && predictor < PNG_PREDICTORS) return null;
  const decoded = filters.length ? decodePDFRawStream(image).decode() : image.contents;
  const data = predictor >= PNG_PREDICTORS ? unfilterRows(decoded, width * channels, channels, height) : decoded;
  if (data.length < width * height * channels) return null;
  return { width, height, channels, data };
}

const BASE64_CHUNK = 0x8000;

/** A data URL of the bytes, in chunks: String.fromCharCode with a whole picture overflows the stack. */
export function dataUrl(type: string, bytes: Uint8Array): string {
  const chunks = Array.from({ length: Math.ceil(bytes.length / BASE64_CHUNK) }, (_, i) =>
    String.fromCharCode(...bytes.subarray(i * BASE64_CHUNK, (i + 1) * BASE64_CHUNK)),
  );
  return `data:${type};base64,${btoa(chunks.join(''))}`;
}
