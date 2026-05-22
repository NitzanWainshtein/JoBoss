import os
import re
import uuid
import asyncio
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from telethon import TelegramClient
from boto3.dynamodb.conditions import Attr
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

########### LOCAL ###########
# ---------- Env ----------
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TABLE_NAME = os.getenv("DYNAMODB_JOBS_TABLE", "jobs")

TG_API_ID = int(os.getenv("TG_API_ID", "0"))
TG_API_HASH = os.getenv("TG_API_HASH", "")
TG_CHANNEL = os.getenv("TG_CHANNEL", "")
TG_LIMIT = int(os.getenv("TG_LIMIT", "120"))

SESSION_NAME = "joboss_telegram_session"

# ---------- AWS ----------
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)

# ---------- Geocoding ----------
_geolocator = Nominatim(user_agent="JoBossProject/1.0 (student project)")
_SKIP_LOCATIONS = {"remote", "מרחוק", "עבודה מרחוק", "unknown", ""}


def geocode_location(location: str):
    """Returns (Decimal lat, Decimal lng) or (None, None). Includes Nominatim rate-limit sleep."""
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
        print(f"  ⚠️  Geocoding error for '{location}': {e}")

    return None, None


def require_env():
    missing = []
    if not TG_API_ID:
        missing.append("TG_API_ID")
    if not TG_API_HASH:
        missing.append("TG_API_HASH")
    if not TG_CHANNEL:
        missing.append("TG_CHANNEL")
    if not TABLE_NAME:
        missing.append("DYNAMODB_JOBS_TABLE")
    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}")


def parse_message(text: str):
    """
    דוגמה לטקסט:
    'Senior Software Engineer @ Nvidia Posted on: ... Location: Tel Aviv ... Click here to apply now!'
    """
    if not text:
        return None

    clean = " ".join(text.split())  # normalize whitespace
    if "@" not in clean:
        return None

    # Title + Company
    # everything before first @ = title
    # after @ until 'Posted on:' (או סוף) = company
    title_part, rest = clean.split("@", 1)
    title = title_part.strip(" -•\t")

    company = rest
    for stop in ["Posted on:", "Location:", "Click here", "#"]:
        idx = company.find(stop)
        if idx != -1:
            company = company[:idx]
    company = company.strip(" -•\t")

    # Location
    location = "Unknown"
    loc_match = re.search(r"Location:\s*(.*?)(Click here|#|$)", clean, flags=re.IGNORECASE)
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
    client = TelegramClient(SESSION_NAME, TG_API_ID, TG_API_HASH)
    await client.start()
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
            expires_at = int((created_at + timedelta(days=10)).timestamp())

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


def main():
    require_env()

    print(f"Reading up to {TG_LIMIT} messages from @{TG_CHANNEL} ...")
    messages = asyncio.run(fetch_messages())
    print(f"Fetched {len(messages)} messages.")

    inserted, skipped_dup, skipped_unparsed = insert_jobs(messages)
    print(
        f"✅ Done. Inserted={inserted}, "
        f"SkippedDuplicates={skipped_dup}, SkippedUnparsed={skipped_unparsed}"
    )


if __name__ == "__main__":
    main()