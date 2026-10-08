#!/usr/bin/env node
/**
 * Generates the PWA icon set with zero dependencies:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-512-maskable.png
 *
 * Renders a teal rounded square with a white "M" glyph, supersampled 4x for
 * clean edges, then encodes PNG with node:zlib. Run via `npm run icons`.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const TEAL = [15, 118, 110] // #0f766e — matches theme_color in the manifest
const WHITE = [255, 255, 255]
const SS = 4 // supersampling factor

/** Squared distance from point p to segment ab. */
function distSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return ex * ex + ey * ey
}

/** Inside test for a rounded rectangle centred at (0,0), half-extent h, radius r. */
function inRoundedRect(x, y, h, r) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  if (ax > h || ay > h) return false
  const cx = Math.max(ax - (h - r), 0)
  const cy = Math.max(ay - (h - r), 0)
  return cx * cx + cy * cy <= r * r
}

/**
 * The "M" glyph as four thick strokes in unit space (x,y ∈ [-1,1], y down).
 * Returns true when (x,y) falls inside the glyph.
 */
function inGlyph(x, y, halfW) {
  const strokes = [
    [-0.82, 0.95, -0.82, -0.95], // left stem (bottom → top)
    [-0.82, -0.95, 0, 0.3], // left diagonal down to the valley
    [0, 0.3, 0.82, -0.95], // right diagonal up
    [0.82, -0.95, 0.82, 0.95], // right stem
  ]
  const hw2 = halfW * halfW
  for (const [ax, ay, bx, by] of strokes) {
    if (distSq(x, y, ax, ay, bx, by) <= hw2) return true
  }
  return false
}

/**
 * Render one icon.
 * @param {number} size output pixel size
 * @param {{maskable?: boolean}} opts maskable = full-bleed bg + smaller glyph
 */
function render(size, opts = {}) {
  const { maskable = false } = opts
  const S = size * SS
  const px = new Uint8Array(S * S * 4)

  // Geometry in supersampled pixels (centred at S/2).
  const h = S / 2
  const radius = maskable ? 0 : h * 0.44 // maskable: full bleed, OS clips
  const glyphScale = maskable ? h * 0.5 : h * 0.58 // safe zone on maskable
  const glyphHalfW = maskable ? 0.24 : 0.26

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const lx = x + 0.5 - h
      const ly = y + 0.5 - h

      let insideBg = maskable ? true : inRoundedRect(lx, ly, h - 0.5, radius)
      let color
      if (!insideBg) {
        color = [0, 0, 0, 0]
      } else {
        const gx = lx / glyphScale
        const gy = ly / glyphScale
        color = inGlyph(gx, gy, glyphHalfW)
          ? [WHITE[0], WHITE[1], WHITE[2], 255]
          : [TEAL[0], TEAL[1], TEAL[2], 255]
      }
      const i = (y * S + x) * 4
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      px[i + 3] = color[3]
    }
  }

  // Downsample using premultiplied-alpha averaging — naive straight-RGBA
  // averaging would drag transparent (0,0,0,0) samples into edge pixels and
  // leave a dark fringe around the icon.
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4
          const sa = px[i + 3]
          r += px[i] * sa
          g += px[i + 1] * sa
          b += px[i + 2] * sa
          a += sa
        }
      }
      const o = (y * size + x) * 4
      if (a === 0) continue
      out[o] = Math.round(r / a)
      out[o + 1] = Math.round(g / a)
      out[o + 2] = Math.round(b / a)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

// ---- PNG encoding ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // compression / filter / interlace = 0

  // Raw scanlines, each prefixed with filter byte 0 (None).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
              : Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
                .copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- main ----

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
]

for (const [name, size, maskable] of targets) {
  const file = path.join(OUT_DIR, name)
  writeFileSync(file, encodePng(render(size, { maskable }), size))
  console.log(`✓ ${path.relative(process.cwd(), file)} (${size}×${size})`)
}
