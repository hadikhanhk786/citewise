#!/usr/bin/env bash
# Shallow, sparse clones of the docs library into ./repos (re-run to update).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p repos
grep -v '^#' sources.txt | while IFS='|' read -r name label repo paths glob; do
  name=$(echo $name); repo=$(echo $repo); paths=$(echo $paths | tr ',' ' ')
  dir=repos/$name
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull -q --depth 1 || true
  else
    git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/$repo.git" "$dir"
    git -C "$dir" sparse-checkout set --no-cone $(for p in $paths; do echo "/$p"; done)
  fi
  echo "$name: $(git -C "$dir" log -1 --format=%cs)"
done
