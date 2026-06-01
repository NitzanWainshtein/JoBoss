import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import boto3
from telethon import TelegramClient
from telethon.sessions import StringSession

from geocoding import geocode_location
from job_description_ai import normalize_description_with_ai
from job_description_fetcher import fetch_full_description
from jobs_repository import exists_by_source_job
from telegram_jobs import extract_apply_url, extract_preview_description, parse_message

######## CONNECTED TO AWS #########
# ---------- Env ----------
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TABLE_NAME = os.getenv("DYNAMODB_JOBS_TABLE", "jobs")

TG_API_ID = int(os.getenv("TG_API_ID", "0"))
TG_API_HASH = os.getenv("TG_API_HASH", "")
TG_SESSION_STRING = os.getenv("TG_SESSION_STRING", "")
TG_CHANNEL = os.getenv("TG_CHANNEL", "")
TG_LIMIT = int(os.getenv("TG_LIMIT", "120"))

# ---------- AWS ----------
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)


def require_env():
    missing = []

    if not TG_API_ID:
        missing.append("TG_API_ID")

    if not TG_API_HASH:
        missing.append("TG_API_HASH")

    if not TG_SESSION_STRING:
        missing.append("TG_SESSION_STRING")

    if not TG_CHANNEL:
        missing.append("TG_CHANNEL")

    if not TABLE_NAME:
        missing.append("DYNAMODB_JOBS_TABLE")

    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}")


async def fetch_messages():
    client = TelegramClient(
        StringSession(TG_SESSION_STRING),
        TG_API_ID,
        TG_API_HASH
    )

    await client.connect()

    if not await client.is_user_authorized():
        await client.disconnect()
        raise ValueError("Telegram session is not authorized")

    entity = await client.get_entity(TG_CHANNEL)
    messages = await client.get_messages(entity, limit=TG_LIMIT)

    await client.disconnect()

    return messages


def insert_jobs(messages):
    inserted = 0
    skipped_duplicates = 0
    skipped_unparsed = 0

    with table.batch_writer() as batch:
        for msg in messages:
            msg_id = str(msg.id)
            raw_text = msg.message or ""

            parsed = parse_message(raw_text)

            if not parsed:
                skipped_unparsed += 1
                continue

            source = "telegram"
            source_job_id = f"{TG_CHANNEL}:{msg_id}"
            telegram_url = f"https://t.me/{TG_CHANNEL}/{msg_id}"
            apply_url = extract_apply_url(msg, telegram_url)

            if exists_by_source_job(table, source, source_job_id):
                skipped_duplicates += 1
                continue

            lat, lng = geocode_location(parsed["location"])

            created_at = datetime.now(timezone.utc)
            expires_at = int((created_at + timedelta(days=10)).timestamp()) # sets expire date for 10 days

            raw_description = fetch_full_description(
                apply_url,
                extract_preview_description(msg, parsed["description"]),
            )

            normalized_description = normalize_description_with_ai(
                parsed["title"],
                parsed["company"],
                parsed["location"],
                raw_description,
            )

            description = normalized_description["description"]
            short_description = normalized_description["shortDescription"]

            item = {
                "jobId": str(uuid.uuid4()),
                "source": source,
                "sourceJobId": source_job_id,
                "title": parsed["title"],
                "company": parsed["company"],
                "location": parsed["location"],
                "applyUrl": apply_url,
                "telegramUrl": telegram_url,
                "createdAt": created_at.isoformat(),
                "expiresAt": expires_at,
                "isActive": True,
                "description": description,
                "shortDescription": short_description,
            }

            if lat is not None and lng is not None:
                item["latitude"] = lat
                item["longitude"] = lng

            batch.put_item(Item=item)
            inserted += 1

    return inserted, skipped_duplicates, skipped_unparsed


def lambda_handler(event, context):
    try:
        require_env()

        messages = asyncio.run(fetch_messages())
        inserted, skipped_dup, skipped_unparsed = insert_jobs(messages)

        result = {
            "message": "Telegram jobs import completed",
            "fetched": len(messages),
            "inserted": inserted,
            "skippedDuplicates": skipped_dup,
            "skippedUnparsed": skipped_unparsed,
        }

        print(result)

        return {
            "statusCode": 200,
            "body": result,
        }

    except Exception as e:
        print(f"Import failed: {e}")

        return {
            "statusCode": 500,
            "body": {
                "error": str(e),
            },
        }