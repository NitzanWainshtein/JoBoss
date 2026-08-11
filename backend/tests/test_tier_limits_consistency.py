"""Guards the per-tier limits that are declared in more than one Lambda.

TIER_LIMITS is defined independently in the swipes handler and the subscriptions
handler, with only a code comment ("Mirrors TIER_LIMITS in the swipes Lambda")
holding them together. They currently agree, but nothing stops a price or quota
change from landing in one and not the other — and the two disagreeing is not a
crash, it is a user who is billed for 30 swipes and gated at 5.

These tests fail the moment the two drift.

Run:  pytest backend/tests
"""
from conftest import load_lambda

swipes = load_lambda("swipes")
subs = load_lambda("subscriptions")

PLANS = ("FREE", "PREMIUM", "PREMIUM_PLUS")


# ── the actual drift guard ────────────────────────────────────────────────────

def test_tier_limits_identical_across_lambdas():
    assert swipes.TIER_LIMITS == subs.TIER_LIMITS, (
        "swipes and subscriptions disagree on TIER_LIMITS — a plan change was "
        "applied to only one of them"
    )


def test_all_plans_present_in_both():
    for plan in PLANS:
        assert plan in swipes.TIER_LIMITS
        assert plan in subs.TIER_LIMITS


def test_plan_limits_derives_from_daily_swipes():
    # subscriptions reports PLAN_LIMITS to the client; it must be the same number
    # the swipes Lambda actually enforces, not a second hand-maintained copy.
    for plan in PLANS:
        assert subs.PLAN_LIMITS[plan] == swipes.TIER_LIMITS[plan]["daily_swipes"]


def test_subscription_plan_catalogue_matches_tier_limits():
    # PLANS is what the pricing UI renders. If it says 30 swipes while TIER_LIMITS
    # enforces 5, the app is advertising something it will not deliver.
    for plan in PLANS:
        assert subs.PLANS[plan]["daily_swipes"] == subs.TIER_LIMITS[plan]["daily_swipes"]


# ── shape/semantics of the limits themselves ──────────────────────────────────

def test_swipe_limit_lookup_falls_back_to_free():
    # An unknown or missing plan must never resolve to something permissive.
    assert swipes.get_swipe_limit("NOT_A_PLAN") == swipes.TIER_LIMITS["FREE"]["daily_swipes"]
    assert swipes.get_swipe_limit("") == swipes.TIER_LIMITS["FREE"]["daily_swipes"]
    assert swipes.get_swipe_limit(None) == swipes.TIER_LIMITS["FREE"]["daily_swipes"]


def test_limits_are_monotonic_by_tier():
    # Paying more must never buy fewer swipes. -1 means unlimited, so it sorts last.
    def rank(plan):
        value = swipes.TIER_LIMITS[plan]["daily_swipes"]
        return float("inf") if value == -1 else value

    assert rank("FREE") < rank("PREMIUM") < rank("PREMIUM_PLUS")


def test_only_unlimited_uses_negative_one():
    for plan in PLANS:
        value = swipes.TIER_LIMITS[plan]["daily_swipes"]
        assert value == -1 or value > 0, f"{plan} has a nonsensical limit: {value}"


def test_ai_tailoring_is_a_paid_feature():
    assert swipes.TIER_LIMITS["FREE"]["ai_tailoring"] is False
    assert swipes.TIER_LIMITS["PREMIUM"]["ai_tailoring"] is True
    assert swipes.TIER_LIMITS["PREMIUM_PLUS"]["ai_tailoring"] is True


def test_free_plan_is_actually_free_and_paid_plans_are_not():
    assert subs.PLANS["FREE"]["price_monthly"] == 0
    assert subs.PLANS["FREE"]["stripe_price_id"] is None
    for plan in ("PREMIUM", "PREMIUM_PLUS"):
        assert subs.PLANS[plan]["price_monthly"] > 0


def test_premium_plus_costs_more_than_premium():
    assert subs.PLANS["PREMIUM_PLUS"]["price_monthly"] > subs.PLANS["PREMIUM"]["price_monthly"]
