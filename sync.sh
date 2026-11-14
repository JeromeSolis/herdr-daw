#!/bin/sh
# Copies the layout from your Herdr home into this repo, so the repo matches what
# you run. Only the shipped files: the layout and its preview, the theme and the
# mod (without its generated typings). Your data, layout state and scenes stay out.
# It doesn't commit; it ends with git status so you can see what changed.
set -eu

HERDR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
REPO="$(cd "$(dirname "$0")" && pwd)"

for f in layouts/daw.json layouts/daw.svg themes/daw.json mods/daw/main.js; do
  [ -f "$HERDR/$f" ] || { echo "sync: $HERDR/$f not found" >&2; exit 1; }
done

mkdir -p "$REPO/layouts" "$REPO/themes" "$REPO/mods/daw"
cp "$HERDR/layouts/daw.json" "$HERDR/layouts/daw.svg" "$REPO/layouts/"
cp "$HERDR/themes/daw.json" "$REPO/themes/"
# --delete: files removed from the mod go from the repo too.
rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json --exclude .DS_Store \
  "$HERDR/mods/daw/" "$REPO/mods/daw/"

cd "$REPO"
git status --short
