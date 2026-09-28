#!/usr/bin/env bash
#
# Regenerates src/assets/fonts/ocra.woff2, the OCR-A face the wordmark is drawn in.
#
# The face is only ever used for the wordmark: the `.brand-font` spans in Navbar.astro,
# Footer.astro and contact.astro. What shipped before was the whole face - 247 characters,
# 24 KB, preloaded on every page - to draw nine letters. This keeps those nine and their
# capitals (in case the name is ever set in capitals) and drops the rest, which takes the
# file from 24 KB to 1.7 KB.
#
#   npm run font:subset
#
# The source is src/assets/fonts/ocr-a-full.woff2: the `latin` subset of the
# `@fontsource/ocr-a` package (family "OCR A Extended", digitized data (c) The Monotype
# Corporation 1991-1995), kept in the repository so that a regeneration needs no network.
# Only the subset is referenced from the `fonts` block of astro.config.mjs; the full face is
# in no build.
#
# `--no-hinting` drops the cvt/fpgm/prep and VDMX tables. No glyph of this face carries
# instructions (every `glyf` program is empty, checked with fontTools), so none of them
# changes how a letter is rasterized - they were only bytes. `--name-IDs='*'` keeps every
# name record, including the copyright notice.
#
# tests/unit/brand-font.test.ts checks that the result covers BRAND_NAME. If the wordmark
# ever grows a character, or the brand font is used for something else, extend `characters`
# below and run this again.
set -euo pipefail

cd "$(dirname "$0")/.."

source_font=src/assets/fonts/ocr-a-full.woff2
target_font=src/assets/fonts/ocra.woff2
characters='hypernovaHYPERNOVA'

python3 -c 'import fontTools' 2>/dev/null || {
  echo 'fontTools is missing: pip install fonttools brotli' >&2
  exit 1
}

before=$(wc -c <"$source_font")

python3 -m fontTools.subset "$source_font" \
  --text="$characters" \
  --flavor=woff2 \
  --no-hinting \
  --name-IDs='*' \
  --output-file="$target_font"

python3 - "$target_font" "$characters" <<'PY'
import sys

from fontTools.ttLib import TTFont

covered = set(map(chr, TTFont(sys.argv[1]).getBestCmap()))
missing = sorted(set(sys.argv[2]) - covered)
print(f'{sys.argv[1]}: {len(covered)} characters mapped' + (f', missing {" ".join(missing)}' if missing else ''))
if missing:
    sys.exit('the subset does not cover: ' + ' '.join(missing))
PY

after=$(wc -c <"$target_font")

echo "$source_font $before bytes -> $target_font $after bytes"
