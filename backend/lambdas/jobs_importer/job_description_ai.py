"""
AI normalization client for imported job descriptions.

This module calls the dedicated JoBoss job description AI Lambda to convert raw
company job page text into a clean, consistent candidate-facing description.
"""

import json
import os

import boto3


AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
JOB_DESCRIPTION_AI_LAMBDA_NAME = os.getenv(
    "JOB_DESCRIPTION_AI_LAMBDA_NAME",
    "joboss-job-description-ai",
)

lambda_client = boto3.client("lambda", region_name=AWS_REGION)


def normalize_description_with_ai(title, company, location, raw_description):
    if not raw_description:
        return {
            "description": "",
            "shortDescription": "",
        }

    payload = {
        "action": "normalize-job-description",
        "title": title,
        "company": company,
        "location": location,
        "rawDescription": raw_description,
    }

    try:
        response = lambda_client.invoke(
            FunctionName=JOB_DESCRIPTION_AI_LAMBDA_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode("utf-8"),
        )

        response_payload = json.loads(response["Payload"].read() or "{}")
        body = response_payload.get("body", response_payload)

        if isinstance(body, str):
            body = json.loads(body)

        description = (body.get("description") or "").strip()
        short_description = (body.get("shortDescription") or "").strip()

        if description:
            return {
                "description": description[:5000],
                "shortDescription": short_description[:700],
            }

    except Exception as e:
        print(f"AI description normalization failed: {e}")

    return {
        "description": raw_description[:5000],
        "shortDescription": raw_description[:700],
    }