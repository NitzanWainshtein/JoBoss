"""Shared helpers for loading Lambda handlers in tests.

Every Lambda's entry point is named `handler.py`. Doing `sys.path.insert(...)`
plus `import handler` in more than one test file therefore returns whichever one
was imported first — the second test would silently assert against the wrong
module. Loading each by explicit path under a unique module name avoids that
entirely.
"""
import importlib.util
import os
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAMBDAS = ROOT / "lambdas"
FARGATE = ROOT / "fargate"

# Handlers construct boto3 clients at import time. Constructing a client needs a
# region but performs no network I/O, so this is enough to import them offline.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")


def _stub_stripe():
    """Minimal stand-in for the `stripe` package.

    The subscriptions handler imports stripe at module scope, but stripe is
    vendored at deploy time rather than installed for development, so it is absent
    both locally and in CI. These tests only exercise pure pricing/limit logic, so
    a stub is the honest way to reach it — if a test ever needs real Stripe
    behaviour it should be an integration test, not this.
    """
    if "stripe" in sys.modules:
        return
    stripe = types.ModuleType("stripe")
    stripe.api_key = None

    class _Webhook:
        @staticmethod
        def construct_event(*_args, **_kwargs):
            raise NotImplementedError("stripe is stubbed in tests")

    stripe.Webhook = _Webhook
    stripe.error = types.SimpleNamespace(SignatureVerificationError=Exception)
    sys.modules["stripe"] = stripe


def _stub_playwright():
    """Minimal stand-in for `playwright` and `playwright_stealth`.

    Both are Docker-only dependencies of the Fargate tasks (backend/fargate/) —
    never installed locally or in CI, same reasoning as jobs_importer's telethon
    (see backend/lambdas/jobs_importer/requirements.txt). This exists only so a
    Fargate script's module-level `from playwright.sync_api import ...` does not
    raise ImportError, letting tests exercise the script's own orchestration logic
    (counting, DRY_RUN gating, escalation) with the browser calls it makes
    monkeypatched out per-test. It is not a fake browser — no test here should
    rely on stubbed Playwright objects actually doing anything.
    """
    if "playwright" in sys.modules:
        return

    playwright_pkg = types.ModuleType("playwright")
    sync_api = types.ModuleType("playwright.sync_api")

    class _PlaywrightTimeout(Exception):
        pass

    def _unset_sync_playwright(*_args, **_kwargs):
        raise NotImplementedError("playwright is stubbed in tests — monkeypatch the call site instead")

    sync_api.sync_playwright = _unset_sync_playwright
    sync_api.TimeoutError = _PlaywrightTimeout
    playwright_pkg.sync_api = sync_api

    playwright_stealth = types.ModuleType("playwright_stealth")
    playwright_stealth.stealth_sync = lambda page: None

    sys.modules["playwright"] = playwright_pkg
    sys.modules["playwright.sync_api"] = sync_api
    sys.modules["playwright_stealth"] = playwright_stealth


def _load_from_dir(base_dir, subdir, entry, module_name):
    """Core loader shared by load_lambda and load_fargate — see their docstrings.

    Deployed, every file in a Lambda's directory sits at the root of the same
    zip (and every file in a Fargate task's directory sits in the same Docker
    build context), so `handler.py` doing `import jobs_repository` just works.
    Loading by file path does not give sibling imports that for free, so the
    module's own directory goes on sys.path for the duration of this
    exec_module call — scoped narrowly (inserted, then always removed, even on
    failure) because two different directories can each have a same-named
    sibling file (both jobs_status_checker/ and fargate/job-status-checker/
    have a jobs_repository.py); leaving both on sys.path at once would let an
    import resolve to the wrong one depending on search order.
    """
    _stub_stripe()
    _stub_playwright()

    src_dir = base_dir / subdir
    path = src_dir / entry
    if not path.exists():
        raise FileNotFoundError(path)

    name = module_name or f"joboss_{subdir.replace('-', '_')}_{Path(entry).stem}"
    if name in sys.modules:
        return sys.modules[name]

    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module

    before = set(sys.modules)
    sys.path.insert(0, str(src_dir))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(src_dir))
        # A sibling import inside this module (e.g. `import jobs_repository`)
        # caches under ITS bare name, not our qualified one. Evict anything this
        # call newly added, except the qualified module we're intentionally
        # keeping — see the docstring above for why this matters.
        for key in set(sys.modules) - before - {name}:
            del sys.modules[key]

    return module


def load_lambda(lambda_dir, entry="handler.py", module_name=None):
    """Import a Lambda entry file under a unique module name and return it."""
    return _load_from_dir(LAMBDAS, lambda_dir, entry, module_name)


def load_fargate(task_dir, entry, module_name=None):
    """Import a file from backend/fargate/<task_dir>/ under a unique module name.

    `entry` has no default — Fargate tasks are not named `handler.py` by
    convention the way Lambdas are (e.g. check_jobs.py, apply.py).
    """
    return _load_from_dir(FARGATE, task_dir, entry, module_name)
