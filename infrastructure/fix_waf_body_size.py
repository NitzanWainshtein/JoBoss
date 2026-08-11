"""Override SizeRestrictions_BODY (8KB body cap) to Count in joboss-api-waf.

The managed CommonRuleSet blocked every JSON body over 8KB with 403 —
including profile-image uploads and legacy base64 resume uploads. All other
WAF protections stay fully active.
"""
import boto3

waf = boto3.client("wafv2", region_name="us-east-1")

acl = waf.get_web_acl(Name="joboss-api-waf", Scope="REGIONAL",
                      Id="de6077ee-a0ed-4fa5-9c19-67498906cbd0")
cfg = acl["WebACL"]
lock = acl["LockToken"]

rules = cfg["Rules"]
for rule in rules:
    stmt = rule.get("Statement", {}).get("ManagedRuleGroupStatement")
    if stmt and stmt.get("Name") == "AWSManagedRulesCommonRuleSet":
        overrides = stmt.setdefault("RuleActionOverrides", [])
        if not any(o["Name"] == "SizeRestrictions_BODY" for o in overrides):
            overrides.append({
                "Name": "SizeRestrictions_BODY",
                "ActionToUse": {"Count": {}},
            })
        print("override added to CommonRuleSet")

waf.update_web_acl(
    Name=cfg["Name"], Scope="REGIONAL", Id=cfg["Id"],
    DefaultAction=cfg["DefaultAction"],
    Description=cfg.get("Description", ""),
    Rules=rules,
    VisibilityConfig=cfg["VisibilityConfig"],
    LockToken=lock,
)
print("web ACL updated")
