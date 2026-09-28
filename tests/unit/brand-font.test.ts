/**
 * Unit tests for the brand font. They run with Node's own test runner and type stripping,
 * so no test framework is needed:
 *
 *   npm run test:unit
 *
 * The face is a WOFF2 file and Node has no font parser, so this reads the two structures
 * the check needs: the table directory, and the character map inside the decoded data.
 * That is what proves the thing nothing else does - that every character of the wordmark
 * has a glyph in the file that actually ships - and it fails with the command to run when
 * the wordmark grows a character the subset does not hold.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { brotliDecompressSync } from 'node:zlib';

import { BRAND_NAME } from '../../src/config.ts';

/** The face the build uses, and the whole face it is cut from (scripts/subset-brand-font.sh). */
const SUBSET = 'src/assets/fonts/ocra.woff2';
const FULL = 'src/assets/fonts/ocr-a-full.woff2';

/**
 * The table tags a WOFF2 directory can refer to by index, in the order the format defines.
 * An entry that does not use one of these writes the four bytes of its tag out instead.
 */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

type Table = { tag: string; offset: number; length: number };

/**
 * The tables of a WOFF2 file and the data they were compressed from. The header is 48
 * bytes, the directory follows it, and the rest of the file is one Brotli block holding
 * every table in directory order.
 */
function readTables(path: string) {
  const file = readFileSync(path);
  assert.equal(file.toString('latin1', 0, 4), 'wOF2', `${path} is not a WOFF2 file`);

  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let cursor = 48;

  /** UIntBase128, the way the directory writes lengths: 7 bits per byte, high first. */
  const readBase128 = () => {
    let value = 0;

    for (let byte = 0; byte < 5; byte++) {
      const bits = file.readUInt8(cursor++);
      value = value * 128 + (bits & 0x7f);
      if ((bits & 0x80) === 0) return value;
    }

    throw new Error(`invalid UIntBase128 in the table directory of ${path}`);
  };

  const tables: Table[] = [];

  for (let index = 0; index < numTables; index++) {
    const flags = file.readUInt8(cursor++);
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >> 6;
    const tag =
      tagIndex === 0x3f ? file.toString('latin1', cursor, (cursor += 4)) : KNOWN_TAGS[tagIndex];
    assert.ok(tag, `unknown table tag index ${tagIndex} in the directory of ${path}`);

    const origLength = readBase128();
    // `glyf` and `loca` can be stored as a transform and then carry both lengths; every
    // other table is stored as it is, and only its length is written.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion !== 3 : transformVersion !== 0;

    tables.push({ tag, offset: 0, length: transformed ? readBase128() : origLength });
  }

  const data = brotliDecompressSync(file.subarray(cursor, cursor + compressedSize));
  let offset = 0;

  for (const table of tables) {
    table.offset = offset;
    offset += table.length;
  }

  assert.equal(data.length, offset, `the tables of ${path} do not add up to its data`);
  return { data, tables };
}


/**
 * Every character the font maps to a glyph. A format 4 subtable (the BMP one) covers a
 * range per segment: with a range offset of zero the glyph is the character shifted by the
 * segment's delta, and otherwise the glyph index is read from `glyphIdArray` at a byte
 * offset counted from the entry itself - a zero there is a character this face does not
 * have. Only whether that index is zero matters here, so the delta is not applied to it.
 * A format 12 subtable (the characters past the BMP) names its groups outright.
 */
function characterMap(data: Buffer, tables: Table[]) {
  const cmap = tables.find((table) => table.tag === 'cmap');
  assert.ok(cmap, 'the font has no character map');

  const table = data.subarray(cmap.offset, cmap.offset + cmap.length);
  const subtables = table.readUInt16BE(2);
  const covered = new Set<number>();

  for (let index = 0; index < subtables; index++) {
    const offset = table.readUInt32BE(4 + index * 8 + 4);
    const format = table.readUInt16BE(offset);

    if (format === 4) {
      const segments = table.readUInt16BE(offset + 6) / 2;
      const endCodes = offset + 14;
      const startCodes = endCodes + segments * 2 + 2; // the two bytes of padding
      const deltas = startCodes + segments * 2;
      const rangeOffsets = deltas + segments * 2;

      for (let segment = 0; segment < segments; segment++) {
        const end = table.readUInt16BE(endCodes + segment * 2);
        const start = table.readUInt16BE(startCodes + segment * 2);
        const delta = table.readInt16BE(deltas + segment * 2);
        const rangeOffset = table.readUInt16BE(rangeOffsets + segment * 2);

        // The last segment of the table starts and ends at 0xffff: it is the terminator.
        for (let code = start; code <= end && code !== 0xffff; code++) {
          const address = rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
          const glyph =
            rangeOffset === 0
              ? (code + delta) & 0xffff
              : address + 2 <= table.length
                ? table.readUInt16BE(address)
                : 0;

          if (glyph !== 0) covered.add(code);
        }
      }
    }

    if (format === 12) {
      const groups = table.readUInt32BE(offset + 12);

      for (let group = 0; group < groups; group++) {
        const start = table.readUInt32BE(offset + 16 + group * 12);
        const end = Math.min(table.readUInt32BE(offset + 16 + group * 12 + 4), start + 0xffff);

        for (let code = start; code <= end; code++) covered.add(code);
      }
    }
  }

  assert.ok(covered.size > 0, 'no format 4 or format 12 character map was found');
  return covered;
}

test('the brand font covers every character of the wordmark', () => {
  const { data, tables } = readTables(SUBSET);
  const covered = characterMap(data, tables);
  const missing = [...BRAND_NAME, ...BRAND_NAME.toUpperCase()].filter(
    (character) => !covered.has(character.codePointAt(0) ?? 0)
  );

  assert.deepEqual(
    missing,
    [],
    `${SUBSET} has no glyph for ${missing.join(' ') || 'nothing'}: extend the characters in ` +
      'scripts/subset-brand-font.sh and run npm run font:subset'
  );
});

test('the brand font is the subset, not the whole face', () => {
  const { data, tables } = readTables(SUBSET);
  const covered = characterMap(data, tables);
  const bytes = readFileSync(SUBSET).length;

  assert.ok(
    bytes < 8 * 1024,
    `${SUBSET} is ${bytes} bytes: the whole face is 24 KB and 247 characters, ` +
      'the wordmark 18 glyphs and 1.7 KB'
  );

  // Characters the wordmark never draws, so that shipping the whole face again - by
  // pointing astro.config.mjs back at it, say - cannot pass this unnoticed.
  const unused = [...'qz0189@'].filter((character) => covered.has(character.codePointAt(0) ?? 0));

  assert.deepEqual(unused, [], `${SUBSET} still maps characters the wordmark never draws`);
});

test('the whole face the subset is cut from still covers latin', () => {
  // This is also the reader's own check: it has to see a real face, with the whole latin
  // range in it, or what it says about the subset means nothing.
  const { data, tables } = readTables(FULL);
  const covered = characterMap(data, tables);
  const absent = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter(
    (character) => !covered.has(character.codePointAt(0) ?? 0)
  );

  assert.deepEqual(
    absent,
    [],
    `${FULL} has lost ${absent.join('')} (it is the file npm run font:subset reads)`
  );
  assert.ok(covered.size > 200, `${FULL} maps only ${covered.size} characters`);
});
