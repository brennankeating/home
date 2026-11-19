#!/usr/bin/env node
// Scans images/photography/ and generates photography/photos.json for the Photography page.
// Car photos are ordered newest first by the date they were taken (camera EXIF data),
// falling back to when the file was created. Fashion photos are ordered by file name.
// Usage: node scripts/sync-photos.js  (runs automatically on commit via .githooks/pre-commit)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PHOTO_DIR = path.join(ROOT, 'images/photography');
const OUTPUT = path.join(ROOT, 'photography/photos.json');
const IMAGE_EXT = /\.(webp|jpe?g|png)$/i;

// Folder name → sort order ('date' = newest first, 'name' = by file name)
const CATEGORIES = {
  car: 'date',
  fashion: 'name',
};

// Returns the offset of the EXIF (TIFF) block in a JPEG, PNG or WebP file, or null
function findExif(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let pos = 2;
    while (pos + 4 <= buf.length && buf[pos] === 0xff) {
      const marker = buf[pos + 1];
      if (marker === 0xda) break; // image data starts, no metadata past here
      if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') return pos + 10;
      pos += 2 + buf.readUInt16BE(pos + 2);
    }
    return null;
  }

  if (buf.toString('latin1', 1, 4) === 'PNG') {
    let pos = 8;
    while (pos + 8 <= buf.length) {
      if (buf.toString('latin1', pos + 4, pos + 8) === 'eXIf') return pos + 8;
      pos += 12 + buf.readUInt32BE(pos);
    }
    return null;
  }

  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    let pos = 12;
    while (pos + 8 <= buf.length) {
      const size = buf.readUInt32LE(pos + 4);
      if (buf.toString('latin1', pos, pos + 4) === 'EXIF') {
        const data = pos + 8;
        return buf.toString('latin1', data, data + 6) === 'Exif\0\0' ? data + 6 : data;
      }
      pos += 8 + size + (size % 2);
    }
  }

  return null;
}

// Reads DateTimeOriginal (or DateTimeDigitized) from the EXIF block as a timestamp
function readExifDate(buf, tiff) {
  const le = buf.toString('latin1', tiff, tiff + 2) === 'II';
  const u16 = offset => (le ? buf.readUInt16LE(tiff + offset) : buf.readUInt16BE(tiff + offset));
  const u32 = offset => (le ? buf.readUInt32LE(tiff + offset) : buf.readUInt32BE(tiff + offset));

  const findTag = (ifd, tag) => {
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === tag) return u32(entry + 8);
    }
    return null;
  };

  const exifIfd = findTag(u32(4), 0x8769);
  if (exifIfd === null) return null;

  for (const tag of [0x9003, 0x9004]) {
    const offset = findTag(exifIfd, tag);
    if (offset === null) continue;
    const text = buf.toString('latin1', tiff + offset, tiff + offset + 19);
    const m = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (m && m[1] !== '0000') return new Date(m[1], m[2] - 1, m[3], m[4], m[5], m[6]).getTime();
  }
  return null;
}

function photoDate(file) {
  try {
    const buf = fs.readFileSync(file);
    const tiff = findExif(buf);
    const taken = tiff === null ? null : readExifDate(buf, tiff);
    if (taken) return taken;
  } catch {
    // unreadable or malformed metadata, fall back to the file date
  }
  // Copying a file resets its creation date but keeps its modified date, so the
  // earlier of the two is when the file (e.g. a Photoshop export) was really made
  const stat = fs.statSync(file);
  return stat.birthtimeMs > 0 ? Math.min(stat.birthtimeMs, stat.mtimeMs) : stat.mtimeMs;
}

const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function main() {
  const manifest = {};

  for (const [category, sortBy] of Object.entries(CATEGORIES)) {
    const dir = path.join(PHOTO_DIR, category);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => IMAGE_EXT.test(f) && !f.startsWith('.'))
      : [];

    if (sortBy === 'date') {
      const dates = new Map(files.map(f => [f, photoDate(path.join(dir, f))]));
      files.sort((a, b) => dates.get(b) - dates.get(a) || byName(a, b));
    } else {
      files.sort(byName);
    }

    manifest[category] = files;
    console.log(`${category}: ${files.length} photo(s)`);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(ROOT, OUTPUT)}`);
}

main();
