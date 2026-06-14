# JoBoss feature:
# - F-17: Job Importer - Telegram Channel

"""
Lambda entry point for AI job description normalization.

This Lambda receives raw company job page text and returns a concise,
consistent candidate-facing job description using Bedrock.
"""

import json
import os
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from job_description_normalizer import normalize_job_description


AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")

bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)


def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    raise TypeError


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, default=decimal_to_native),
    }


def get_body(event):
    if isinstance(event.get("body"), str):
        return json.loads(event.get("body") or "{}")
    return event.get("body") or event


def invoke_bedrock_claude(messages, max_tokens=1500):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "messages": messages,
    }

    result = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    result_body = json.loads(result["body"].read())
    return result_body["content"][0]["text"]


def invoke_bedrock(prompt):
    return invoke_bedrock_claude([
        {"role": "user", "content": [{"type": "text", "text": prompt}]}
    ])


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    try:
        body = get_body(event)
        action = body.get("action") or event.get("action")

        if action != "normalize-job-description":
            return response(400, {"error": "Unsupported action"})

        return normalize_job_description(body, invoke_bedrock, response)

    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    except ClientError as error:
        return response(500, {
            "error": "AWS service error",
            "details": str(error),
        })

    except Exception as error:
        return response(500, {
            "error": "Internal server error",
            "details": str(error),
        })