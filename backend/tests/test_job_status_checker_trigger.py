"""Tests for the tiny Tier 2 dispatcher Lambda.

Run:  pytest backend/tests
"""
from conftest import load_lambda

trigger = load_lambda("job_status_checker_trigger")


class FakeECS:
    def __init__(self, failures=None):
        self.calls = []
        self.failures = failures or []

    def run_task(self, **kwargs):
        self.calls.append(kwargs)
        if self.failures:
            return {"tasks": [], "failures": self.failures}
        return {"tasks": [{"taskArn": "arn:aws:ecs:us-east-1:171109860478:task/abc"}], "failures": []}


def test_starts_the_task_with_configured_network(monkeypatch):
    fake = FakeECS()
    monkeypatch.setattr(trigger, "ecs", fake)
    monkeypatch.setattr(trigger, "SUBNET_IDS", ["subnet-a", "subnet-b"])
    monkeypatch.setattr(trigger, "SECURITY_GROUP_IDS", ["sg-1"])

    result = trigger.lambda_handler({}, None)

    assert result["statusCode"] == 200
    assert len(fake.calls) == 1
    net = fake.calls[0]["networkConfiguration"]["awsvpcConfiguration"]
    assert net["subnets"] == ["subnet-a", "subnet-b"]
    assert net["securityGroups"] == ["sg-1"]
    assert fake.calls[0]["launchType"] == "FARGATE"


def test_run_task_failure_is_reported_not_raised(monkeypatch):
    fake = FakeECS(failures=[{"reason": "RESOURCE:CPU", "arn": "..."}])
    monkeypatch.setattr(trigger, "ecs", fake)
    monkeypatch.setattr(trigger, "SUBNET_IDS", ["subnet-a"])
    monkeypatch.setattr(trigger, "SECURITY_GROUP_IDS", ["sg-1"])

    result = trigger.lambda_handler({}, None)

    assert result["statusCode"] == 500
    assert "failures" in result["body"]


def test_missing_network_config_fails_fast(monkeypatch):
    monkeypatch.setattr(trigger, "SUBNET_IDS", [])
    monkeypatch.setattr(trigger, "SECURITY_GROUP_IDS", [])

    result = trigger.lambda_handler({}, None)

    assert result["statusCode"] == 500
    assert "Missing required env vars" in result["body"]["error"]
