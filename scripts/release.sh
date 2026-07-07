#!/usr/bin/env bash
# #ReleaseTagger — cut a per-package git tag from the monorepo.
#
# npm/pnpm cannot install a subdirectory of a git repo as a package, so we
# split the package's subtree into a tree whose root IS the package, then tag
# it. Consumers pin `github:paver-os/kit#<package>-v<semver>` and their install
# runs the package's `prepare` script to build dist.
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
SPLIT_BRANCH="rel/${PKG}-v${VER}"

[ -d "$PREFIX" ] || { echo "no such package dir: $PREFIX" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null && { echo "tag ${TAG} already exists (tags are immutable)" >&2; exit 1; }

# Guard: the package.json version must match the tag being cut.
PKG_VER="$(node -p "require('./${PREFIX}/package.json').version")"
[ "$PKG_VER" = "$VER" ] || { echo "package.json version ($PKG_VER) != tag version ($VER)" >&2; exit 1; }

echo "Splitting ${PREFIX} -> ${SPLIT_BRANCH}"
git subtree split --prefix="${PREFIX}" -b "${SPLIT_BRANCH}"

echo "Tagging ${TAG}"
git tag "${TAG}" "${SPLIT_BRANCH}"
git branch -D "${SPLIT_BRANCH}"

echo "Created immutable tag ${TAG}."
echo "Push it with:  git push origin ${TAG}"
echo "Consumers pin:  \"@paver/${PKG}\": \"github:paver-os/kit#${TAG}\""
