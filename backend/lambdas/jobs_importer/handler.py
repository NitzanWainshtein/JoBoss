import os
import re
import uuid
import asyncio
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from telethon import TelegramClient
from telethon.sessions import StringSession
from boto3.dynamodb.conditions import Attr
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

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

# ---------- Geocoding ----------
_geolocator = Nominatim(user_agent="JoBossProject/1.0 (student project)")
_SKIP_LOCATIONS = {"remote", "מרחוק", "עבודה מרחוק", "unknown", ""}


def geocode_location(location: str):
    """Returns (Decimal lat, Decimal lng) or (None, None)."""
    if not location or location.strip().lower() in _SKIP_LOCATIONS:
        return None, None

    time.sleep(1.1)

    try:
        result = _geolocator.geocode(location, country_codes="il", timeout=10)

        if result:
            return (
                Decimal(str(round(result.latitude, 6))),
                Decimal(str(round(result.longitude, 6))),
            )

    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"Geocoding error for '{location}': {e}")

    return None, None


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


def parse_message(text: str):
    if not text:
        return None

    clean = " ".join(text.split())

    if "@" not in clean:
        return None

    title_part, rest = clean.split("@", 1)
    title = title_part.strip(" -•\t")

    company = rest

    for stop in ["Posted on:", "Location:", "Click here", "#"]:
        idx = company.find(stop)

        if idx != -1:
            company = company[:idx]

    company = company.strip(" -•\t")

    location = "Unknown"

    loc_match = re.search(
        r"Location:\s*(.*?)(Click here|#|$)",
        clean,
        flags=re.IGNORECASE
    )

    if loc_match:
        location = loc_match.group(1).strip(" -•\t")

    if not title or not company:
        return None

    return {
        "title": title,
        "company": company,
        "location": location,
        "description": clean[:5000],
    }


def exists_by_source_job(source: str, source_job_id: str) -> bool:
    scan_kwargs = {
        "FilterExpression": Attr("source").eq(source) & Attr("sourceJobId").eq(source_job_id),
        "ProjectionExpression": "jobId",
    }

    while True:
        resp = table.scan(**scan_kwargs)

        if resp.get("Items"):
            return True

        last_evaluated_key = resp.get("LastEvaluatedKey")

        if not last_evaluated_key:
            return False

        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key


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

            if exists_by_source_job(source, source_job_id):
                skipped_duplicates += 1
                continue

            lat, lng = geocode_location(parsed["location"])

            created_at = datetime.now(timezone.utc)
            expires_at = int((created_at + timedelta(days=10)).timestamp()) # sets expire date for 10 days

            item = {
                "jobId": str(uuid.uuid4()),
                "source": source,
                "sourceJobId": source_job_id,
                "title": parsed["title"],
                "company": parsed["company"],
                "location": parsed["location"],
                "description": parsed["description"],
                "applyUrl": f"https://t.me/{TG_CHANNEL}/{msg_id}",
                "createdAt": created_at.isoformat(),
                "expiresAt": expires_at,
                "isActive": True,
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