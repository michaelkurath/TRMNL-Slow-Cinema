#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 FRAME_ROOT PRODUCTION_BUCKET PREVIEW_BUCKET" >&2
  exit 2
fi

frame_root=$(realpath "$1")
production_bucket=$2
preview_bucket=$3
wrangler_bin=$(realpath node_modules/.bin/wrangler)
film_slug=$(basename "$frame_root")

if [[ ! -d "$frame_root/og" || ! -d "$frame_root/x" ]]; then
  echo "Frame root must contain og/ and x/: $frame_root" >&2
  exit 2
fi

if [[ ! -s "$frame_root/manifest.json" ]]; then
  echo "Missing frame manifest: $frame_root/manifest.json" >&2
  exit 2
fi

ensure_bucket() {
  local bucket=$1
  if ! "$wrangler_bin" r2 bucket info "$bucket" >/dev/null 2>&1; then
    "$wrangler_bin" r2 bucket create "$bucket"
  fi
}

ensure_bucket "$production_bucket"
ensure_bucket "$preview_bucket"

export frame_root production_bucket wrangler_bin film_slug
find "$frame_root/og" "$frame_root/x" -type f -name '*.png' -print0 \
  | sort -z \
  | xargs -0 -n 1 -P 8 bash -c '
      file=$1
      relative=${file#"$frame_root"/}
      key="films/$film_slug/$relative"
      "$wrangler_bin" r2 object put "$production_bucket/$key" \
        --file "$file" \
        --content-type image/png \
        --cache-control "public, max-age=31536000, immutable" \
        --remote \
        --force
    ' _

"$wrangler_bin" r2 object put \
  "$production_bucket/films/$film_slug/manifest.json" \
  --file "$frame_root/manifest.json" \
  --content-type application/json \
  --cache-control "no-cache" \
  --remote \
  --force

verification_dir=$(mktemp -d)
trap 'rm -rf "$verification_dir"' EXIT

verify_object() {
  local relative=$1
  local destination="$verification_dir/$(basename "$relative")"
  "$wrangler_bin" r2 object get \
    "$production_bucket/films/$film_slug/$relative" \
    --file "$destination" \
    --remote
  cmp "$frame_root/$relative" "$destination"
}

verify_object manifest.json
verify_object og/000000.png
verify_object "og/$(find "$frame_root/og" -type f -name '*.png' -printf '%f\n' | sort | tail -1)"
verify_object x/000000.png
verify_object "x/$(find "$frame_root/x" -type f -name '*.png' -printf '%f\n' | sort | tail -1)"

echo "Uploaded and verified all frames and the manifest in $production_bucket."
