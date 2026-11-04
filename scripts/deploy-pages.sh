#!/bin/sh
# Publishes the current build to the gh-pages branch, which GitHub Pages serves.
# Commits use this repository's git identity, so no automation account appears in the history.
set -e
cd "$(dirname "$0")/.."
npm run build
name=$(git config user.name)
email=$(git config user.email)
sha=$(git rev-parse --short HEAD)
url=$(git remote get-url origin)
tmp=$(mktemp -d)
cp -R dist/. "$tmp/"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q -b gh-pages
git config user.name "$name"
git config user.email "$email"
git add -A
git commit -q -m "Deploy $sha"
git push -f "$url" gh-pages
