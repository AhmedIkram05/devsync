"""Dependency hygiene: the packages removed as unused must not creep back."""

from pathlib import Path

REQUIREMENTS = Path(__file__).resolve().parents[2] / "requirements.txt"

REMOVED = {
    "fastapi",
    "uvicorn",
    "passlib",
    "python-multipart",
    "pygithub",
    "marshmallow",
    "celery",
    "kombu",
    "pydantic",
    "pyaml",
    "supervisor",
}


def _declared_names():
    names = set()
    for line in REQUIREMENTS.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        for separator in ("==", ">=", "<=", "~=", ">"):
            if separator in line:
                line = line.split(separator, 1)[0]
                break
        names.add(line.strip().lower())
    return names


def test_removed_dependencies_do_not_return():
    assert _declared_names().isdisjoint(REMOVED)


def test_pyyaml_is_pinned_for_manifest_tests():
    # tests/unit/test_k8s_manifests.py imports yaml directly.
    assert "pyyaml" in _declared_names()
