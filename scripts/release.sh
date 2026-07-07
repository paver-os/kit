#!/usr/bin/env bash
# #ReleaseTagger — cut a per-package git tag from the monorepo.
#
# npm/pnpm cannot install a subdirectory of a git repo as a package, so we
# publish a BUILT ARTIFACT tag: the tag's tree has the package's `dist/` and a
# runtime-only `package.json` at root. A consumer pins
# `github:paver-os/kit#<package>-v<semver>` and installs a featherweight,
# prebuilt package — no build step, no devDependencies, no tsconfig needed on
# their side.
#
# The build runs here (in the monorepo, where tsconfig.base.json exists); only
# the output ships. Uses git plumbing (a temporary index) so the working tree
# and branches are never touched.
#
# Usage:  scripts/release.sh <package> <semver>
#   e.g.  scripts/release.sh supabase 0.1.0
#
# Preconditions: clean working tree; CI green on the commit being released.
set -euo pipefail

PKG="${1:?usage: release.sh <package> <semver>}"
VER="${2:?usage: release.sh <package> <semver>}"
PREFIX="packages/${PKG}"
TAG="${PKG}-v${VER}"
REPO="$(git rev-parse --show-toplevel)"

[ -d "$REPO/$PREFIX" ] || { echo "no such package dir: $PREFIX" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null && { echo "tag ${TAG} already exists (tags are immutable)" >&2; exit 1; }

PKG_VER="$(node -p "require('$REPO/$PREFIX/package.json').version")"
[ "$PKG_VER" = "$VER" ] || { echo "package.json version ($PKG_VER) != tag version ($VER)" >&2; exit 1; }

echo "Building ${PKG}..."
( cd "$REPO" && pnpm --filter "@paver/${PKG}" build >/dev/null )
[ -d "$REPO/$PREFIX/dist" ] || { echo "build produced no dist/" >&2; exit 1; }

# Assemble the runtime artifact in a staging dir: built dist + a package.json
# stripped of dev-time fields (scripts, devDependencies).
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$REPO/$PREFIX/dist" "$STAGE/dist"
[ -f "$REPO/$PREFIX/README.md" ] && cp "$REPO/$PREFIX/README.md" "$STAGE/README.md"
node -e '
  const fs = require("fs");
  const p = require(process.argv[1]);
  delete p.scripts;
  delete p.devDependencies;
  fs.writeFileSync(process.argv[2], JSON.stringify(p, null, 2) + "\n");
' "$REPO/$PREFIX/package.json" "$STAGE/package.json"

# Build a tag from the staging dir via a temporary index — never touches the
# working tree, HEAD, or any branch.
TMP_INDEX="$(mktemp)"
trap 'rm -rf "$STAGE" "$TMP_INDEX"' EXIT
export GIT_INDEX_FILE="$TMP_INDEX"
git --git-dir="$REPO/.git" read-tree --empty
while IFS= read -r -d '' f; do
  rel="${f#"$STAGE"/}"
  blob="$(git --git-dir="$REPO/.git" hash-object -w "$f")"
  git --git-dir="$REPO/.git" update-index --add --cacheinfo "100644,${blob},${rel}"
done < <(find "$STAGE" -type f -print0)
TREE="$(git --git-dir="$REPO/.git" write-tree)"
COMMIT="$(git --git-dir="$REPO/.git" commit-tree "$TREE" -m "release ${TAG}")"
unset GIT_INDEX_FILE
git tag "${TAG}" "${COMMIT}"

echo "Created immutable built-artifact tag ${TAG}."
echo "Push it with:  git push origin ${TAG}"
echo "Consumers pin:  \"@paver/${PKG}\": \"github:paver-os/kit#${TAG}\""
