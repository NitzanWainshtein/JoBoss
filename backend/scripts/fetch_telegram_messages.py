import os
import re
import asyncio
import time
from decimal import Decimal

from telethon import TelegramClient
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_NAME = "joboss_telegram_session"

CHANNEL_USERNAME = os.getenv("TG_CHANNEL", "")
GEOCODE_PREVIEW = os.getenv("GEOCODE_PREVIEW", "0") == "1"

_geolocator = Nominatim(user_agent="JoBossProject/1.0 (student project)")
_SKIP_LOCATIONS = {"remote", "מרחוק", "עבודה מרחוק", "unknown", ""}


def geocode_location(location: str):
    """Returns (lat, lng) floats or (None, None)."""
    if not location or location.strip().lower() in _SKIP_LOCATIONS:
        return None, None

    time.sleep(1.1)
    try:
        result = _geolocator.geocode(location, country_codes="il", timeout=10)
        if result:
            return round(result.latitude, 6), round(result.longitude, 6)
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"    ⚠️  Geocoding error for '{location}': {e}")

    return None, None


def parse_location(text: str) -> str:
    match = re.search(r"Location:\s*(.*?)(Click here|#|$)", text, flags=re.IGNORECASE)
    return match.group(1).strip(" -•\t") if match else "Unknown"


async def main():
    if not API_ID or not API_HASH or not CHANNEL_USERNAME:
        raise ValueError("Missing TG_API_ID, TG_API_HASH or TG_CHANNEL env vars")

    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start()

    print(f"Reading latest messages from: @{CHANNEL_USERNAME}")
    entity = await client.get_entity(CHANNEL_USERNAME)

    messages = await client.get_messages(entity, limit=20)

    for i, msg in enumerate(messages, start=1):
        text = (msg.message or "").replace("\n", " ")[:200]
        print(f"{i:02d}. id={msg.id} | date={msg.date} | text={text}")

        if GEOCODE_PREVIEW:
            location = parse_location(msg.message or "")
            lat, lng = geocode_location(location)
            coord = f"{lat}, {lng}" if lat is not None else "no result"
            print(f"      📍 location={location!r} → {coord}")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())