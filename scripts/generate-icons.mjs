/* ═══════════════════════════════════════════════════════════════════
 * Build-time icon generator —  node scripts/generate-icons.mjs
 * Runs automatically as part of `npm run build` (after vite build).
 *
 * ── WHY ────────────────────────────────────────────────────────────
 * public/manifest.json declared /icons/icon-192.png and
 * /icons/icon-512.png, and index.html declared /icons/icon-192.png as the
 * apple-touch-icon — but public/icons/ DID NOT EXIST. Every one of those
 * references resolved through the SPA rewrite to index.html and served
 * HTML with `Content-Type: text/html`, which caused:
 *   • Chrome/Edge/Android refusing to install the PWA ("no suitable icon"),
 *   • iOS showing a blank grey tile on "Add to Home Screen",
 *   • the Organization node in index.html's JSON-LD pointing `logo` at a
 *     URL that is not an image at all (a real, fixable quality signal),
 *   • /favicon.ico 404-ing for the many clients that guess it.
 *
 * ── WHAT ───────────────────────────────────────────────────────────
 * The design is copied EXACTLY from public/favicon.svg: a solid #FF3C00
 * rounded square (rx = 20% of the side). This script only rasterises it, so
 * the PNGs and the SVG cannot drift apart. Swap in a real logo by editing
 * MARK below and re-running a build — no design assets are needed and no
 * binary blobs are committed to the repo.
 *
 * ── WHY NOT A DEPENDENCY ───────────────────────────────────────────
 * `sharp`/`resvg`/`canvas` are tens of megabytes of native binaries for
 * what is one flat colour. PNG and ICO are simple container formats, so
 * this writes them directly with node:zlib — zero dependencies, a few
 * milliseconds, nothing to keep patched and nothing to break CI on a
 * platform without prebuilt binaries.
 *
 * ── ICON PURPOSES (this is why there is more than one size) ────────
 *   icon-{192,512}.png            "any"       rounded, transparent corners
 *   icon-maskable-{192,512}.png   "maskable"  full-bleed, OPAQUE
 *   apple-touch-icon.png          iOS         full-bleed, OPAQUE, 180px
 * `maskable` icons are cropped by the OS — usually to a circle — so they
 * must be full-bleed: a flat colour has nothing in the safe zone to lose,
 * but the rounded corners of the "any" icon would be clipped awkwardly.
 * iOS also renders alpha as BLACK, which is why apple-touch-icon.png is
 * fully opaque (iOS applies its own rounded mask on top).
 * ═══════════════════════════════════════════════════════════════════ */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');

/** Must match <rect fill> in public/favicon.svg. */
const MARK = { r: 0xff, g: 0x3c, b: 0x00 };

/** Must match rx=36 on a 180px viewBox in public/favicon.svg. */
const RADIUS_RATIO = 36 / 180;

// ── PNG container ────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** Standard PNG/zlib CRC-32. */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode a raw RGBA buffer (length = w*h*4) as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // colour type 6 = truecolour + alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter method (we emit filter type 0 = None per scanline)
  ihdr[12] = 0; // not interlaced

  // PNG scanlines each carry a leading filter byte; 0 (None) is ideal for
  // the flat, large-area fills this script produces.
  const stride = width * 4;
  const raw    = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO container ────────────────────────────────────────────────────
// Each entry holds a PNG. ICO has allowed PNG payloads since Vista and every
// browser that matters reads them, so no BMP/DIB packing is needed.
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir    = Buffer.alloc(16 * entries.length);
  let   offset = header.length + dir.length;

  entries.forEach((entry, i) => {
    const o = i * 16;
    // 0 means 256 in the ICO directory.
    dir[o]     = entry.size >= 256 ? 0 : entry.size;
    dir[o + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[o + 2] = 0;                        // palette size
    dir[o + 3] = 0;                        // reserved
    dir.writeUInt16LE(1,  o + 4);          // colour planes
    dir.writeUInt16LE(32, o + 6);          // bits per pixel
    dir.writeUInt32LE(entry.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

// ── Drawing ──────────────────────────────────────────────────────────
/**
 * Rasterise the mark.
 * @param size     side length in pixels (square)
 * @param rounded  apply favicon.svg's corner radius (false = full bleed)
 *
 * Edges are anti-aliased analytically: for each pixel we measure how far it
 * lies past the rounded corner's radius and feather the alpha across one
 * pixel. Cheaper and sharper than supersampling, and it keeps the corners of
 * the large icons as smooth as the small ones.
 */
function renderIcon(size, rounded) {
  const buf   = Buffer.alloc(size * size * 4);
  const half  = size / 2;
  const R     = rounded ? size * RADIUS_RATIO : 0;
  const inner = half - R; // radius of the straight-edge region

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alpha = 255;

      if (R > 0) {
        // Distance from the nearest "straight" region on each axis; both are
        // 0 anywhere along a straight edge, so the corner maths only kicks
        // in inside the four corner quadrants.
        const dx = Math.max(Math.abs(x + 0.5 - half) - inner, 0);
        const dy = Math.max(Math.abs(y + 0.5 - half) - inner, 0);
        const d  = Math.sqrt(dx * dx + dy * dy);
        alpha = Math.round(255 * Math.min(Math.max(R - d + 0.5, 0), 1));
      }

      const i = (y * size + x) * 4;
      buf[i]     = MARK.r;
      buf[i + 1] = MARK.g;
      buf[i + 2] = MARK.b;
      buf[i + 3] = alpha;
    }
  }
  return buf;
}

// ── Emit ─────────────────────────────────────────────────────────────
function main() {
  if (!existsSync(DIST)) {
    throw new Error('generate-icons: dist/ not found — `vite build` must run first.');
  }

  mkdirSync(path.join(DIST, 'icons'), { recursive: true });

  const files = [
    // purpose "any" — the icon exactly as designed, rounded corners kept
    { rel: 'icons/icon-192.png',          size: 192, rounded: true  },
    { rel: 'icons/icon-512.png',          size: 512, rounded: true  },
    // purpose "maskable" — full bleed so the OS mask crops cleanly
    { rel: 'icons/icon-maskable-192.png', size: 192, rounded: false },
    { rel: 'icons/icon-maskable-512.png', size: 512, rounded: false },
    // iOS home screen: 180px, full bleed, fully opaque
    { rel: 'icons/apple-touch-icon.png',  size: 180, rounded: false },
  ];

  let bytes = 0;
  for (const f of files) {
    const png = encodePng(f.size, f.size, renderIcon(f.size, f.rounded));
    writeFileSync(path.join(DIST, f.rel), png);
    bytes += png.length;
  }

  // favicon.ico — what browsers and link checkers request when nothing else
  // is specified. The three classic sizes, in the same rounded design.
  const ico = encodeIco([16, 32, 48].map(size => ({
    size,
    png: encodePng(size, size, renderIcon(size, true)),
  })));
  writeFileSync(path.join(DIST, 'favicon.ico'), ico);
  bytes += ico.length;

  console.log(`✔ icons: ${files.length} PNG + favicon.ico (${(bytes / 1024).toFixed(1)} KB) → dist/`);
}

try {
  main();
} catch (err) {
  console.error('\n✖ generate-icons failed:');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
}
