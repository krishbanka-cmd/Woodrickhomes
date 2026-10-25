#!/usr/bin/env bash
set -euo pipefail
# Both GitHub Actions and Cloudflare Workers Builds must publish page assets.
# GitHub already generates them before invoking Wrangler; avoid a second build.
if test -s assets/catalogue-pages/index.json; then
  exit 0
fi
python3 -m venv .catalogue-build-env
.catalogue-build-env/bin/python -m pip install --disable-pip-version-check pymupdf==1.26.6 pillow==11.3.0
.catalogue-build-env/bin/python scripts/build-catalogue-pages.py
