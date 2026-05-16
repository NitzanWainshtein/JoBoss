import json
import os
import boto3
from botocore.exceptions import ClientError

REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "amazon.nova-micro-v1:0")

bedrock = boto3.client("bedrock-runtime", region_name=REGION)


def build_prompt(resume_text: str, job_description: str) -> str:
    return f"""
You are an expert resume editor.

Task:
Tailor the candidate resume to the given job description.
- Keep facts truthful (do not invent experience, tools, or years).
- Emphasize relevant skills and achievements.
- Use concise ATS-friendly bullet points.
- Return plain text only.

Candidate Resume:
{resume_text}

Job Description:
{job_description}

Return:
A tailored resume version (summary + experience bullets + skills).
""".strip()


def invoke_bedrock_nova(prompt: str) -> str:
    body = {
        "messages": [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ],
        "inferenceConfig": {
            "maxTokens": 700,
            "temperature": 0.4,
            "topP": 0.9
        }
    }

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body)
    )

    response_body = json.loads(response["body"].read())
    return response_body["output"]["message"]["content"][0]["text"]


def lambda_handler(event, context):
    resume_text = event.get("resume_text", "").strip()
    job_description = event.get("job_description", "").strip()

    if not resume_text or not job_description:
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": "resume_text and job_description are required"
            })
        }

    try:
        prompt = build_prompt(resume_text, job_description)
        tailored_resume = invoke_bedrock_nova(prompt)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Tailored resume generated",
                "tailored_resume": tailored_resume
            })
        }

    except ClientError as e:
        return {
            "statusCode": 502,
            "body": json.dumps({
                "error": "Bedrock invocation failed",
                "details": str(e)
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Internal server error",
                "details": str(e)
            })
        }