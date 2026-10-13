"""Packaged Swagger spec must stay in sync with the canonical docs copy.

The Docker build context (./backend) excludes the repo docs tree, so
backend/src/static/swagger.yaml ships inside the image as a fallback for
/docs/backend/swagger.yaml. This test fails the build if they drift.
"""

import hashlib
import os


def _sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def test_packaged_swagger_matches_canonical():
    here = os.path.dirname(__file__)
    repo_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
    canonical = os.path.join(repo_root, "docs", "backend", "swagger.yaml")
    packaged = os.path.join(repo_root, "backend", "src", "static", "swagger.yaml")

    assert os.path.isfile(canonical), "canonical spec missing"
    assert os.path.isfile(packaged), "packaged fallback spec missing"
    assert _sha256(packaged) == _sha256(canonical), (
        "backend/src/static/swagger.yaml drifted from docs/backend/swagger.yaml — "
        "re-copy it: cp docs/backend/swagger.yaml backend/src/static/swagger.yaml"
    )
