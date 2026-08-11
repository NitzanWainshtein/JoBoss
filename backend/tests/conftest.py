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

LAMBDAS = Path(__file__).resolve().parents[1] / "lambdas"

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


def load_lambda(lambda_dir, entry="handler.py", module_name=None):
    """Import a Lambda entry file under a unique module name and return it."""
    _stub_stripe()

    path = LAMBDAS / lambda_dir / entry
    if not path.exists():
        raise FileNotFoundError(path)

    name = module_name or f"joboss_{lambda_dir.replace('-', '_')}_{Path(entry).stem}"
    if name in sys.modules:
        return sys.modules[name]

    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    # Register before exec so a handler that imports itself by name still resolves.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
