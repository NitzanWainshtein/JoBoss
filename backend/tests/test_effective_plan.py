"""Tests for effective_plan — the function that decides what a user is entitled to.

This is the boundary between "has paid" and "gets the features". Both directions
of a mistake here are damaging and neither shows up as an error: too strict and a
paying customer is silently downgraded, too loose and a cancelled subscription
keeps its benefits indefinitely.

The PAST_DUE case is the subtle one. A past-due subscription must lose access, but
the stored `plan` must survive — the handler deliberately does not wipe plan on
past_due so that a recovered payment restores the right tier. These tests pin both
halves of that behaviour.

Run:  pytest backend/tests
"""
import pytest

from conftest import load_lambda

subs = load_lambda("subscriptions")


def sub(plan="PREMIUM", status="ACTIVE"):
    return {"plan": plan, "status": status}


# ── statuses that keep entitlement ────────────────────────────────────────────

@pytest.mark.parametrize("status", ["ACTIVE", "TRIAL", "TRIALING", "CANCELLING"])
def test_entitled_statuses_keep_the_plan(status):
    assert subs.effective_plan(sub("PREMIUM", status)) == "PREMIUM"
    assert subs.effective_plan(sub("PREMIUM_PLUS", status)) == "PREMIUM_PLUS"


def test_cancelling_still_entitled_until_period_end():
    # cancel_at_period_end: Stripe keeps the subscription active until the period
    # actually ends, so revoking early would cut off time the user paid for.
    assert subs.effective_plan(sub("PREMIUM_PLUS", "CANCELLING")) == "PREMIUM_PLUS"


# ── statuses that revoke entitlement ──────────────────────────────────────────

@pytest.mark.parametrize("status", [
    "PAST_DUE", "CANCELED", "CANCELLED", "UNPAID", "INCOMPLETE",
    "INCOMPLETE_EXPIRED", "PAUSED", "",
])
def test_non_entitled_statuses_fall_back_to_free(status):
    assert subs.effective_plan(sub("PREMIUM_PLUS", status)) == "FREE"


def test_past_due_revokes_access_without_being_the_stored_plan():
    # effective_plan gates access...
    record = sub("PREMIUM", "PAST_DUE")
    assert subs.effective_plan(record) == "FREE"
    # ...but must not be read as permission to overwrite the purchased tier, or a
    # recovered payment would restore an ACTIVE subscription on plan=FREE.
    assert record["plan"] == "PREMIUM"


def test_unknown_status_is_denied_not_allowed():
    # A status Stripe adds in future must fail closed.
    assert subs.effective_plan(sub("PREMIUM", "SOME_NEW_STRIPE_STATUS")) == "FREE"


# ── defaults and malformed records ────────────────────────────────────────────

def test_empty_record_is_free():
    assert subs.effective_plan({}) == "FREE"


def test_free_status_with_free_plan():
    assert subs.effective_plan(sub("FREE", "FREE")) == "FREE"


def test_status_matching_is_case_sensitive_by_design():
    # The webhook normalises with .upper() before storing, so a lowercase status
    # means something wrote to the table outside that path — fail closed.
    assert subs.effective_plan(sub("PREMIUM", "active")) == "FREE"


def test_every_entitled_status_maps_to_a_known_limit():
    # Whatever effective_plan returns must be a plan PLAN_LIMITS can price.
    for status in ["ACTIVE", "TRIAL", "TRIALING", "CANCELLING", "FREE", "PAST_DUE"]:
        for plan in ["FREE", "PREMIUM", "PREMIUM_PLUS"]:
            resolved = subs.effective_plan(sub(plan, status))
            assert resolved in subs.PLAN_LIMITS, resolved
