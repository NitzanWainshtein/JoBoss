"""
One-time script: geocode all jobs in DynamoDB that are missing latitude/longitude.
Usage: python geocode_existing_jobs.py
Requires: pip install boto3 geopy
"""
import os
import re
import time
from decimal import Decimal

import boto3
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TABLE_NAME = os.getenv("DYNAMODB_JOBS_TABLE", "joboss-jobs")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)

_geolocator = Nominatim(user_agent="JoBossProject/1.0 (student project)")

# (display name, query sent to Nominatim)
KNOWN_IL_CITIES = [
    ("Tel Aviv", "Tel Aviv, Israel"),
    ("Jerusalem", "Jerusalem, Israel"),
    ("Haifa", "Haifa, Israel"),
    ("Herzliya", "Herzliya, Israel"),
    ("Petah Tikva", "Petah Tikva, Israel"),
    ("Ramat Gan", "Ramat Gan, Israel"),
    ("Rishon LeZion", "Rishon LeZion, Israel"),
    ("Rehovot", "Rehovot, Israel"),
    ("Netanya", "Netanya, Israel"),
    ("Beer Sheva", "Beer Sheva, Israel"),
    ("Kibbutz Shefayim", "Shefayim, Israel"),   # Nominatim knows it as Shefayim
    ("Holon", "Holon, Israel"),
    ("Bnei Brak", "Bnei Brak, Israel"),
    ("Bat Yam", "Bat Yam, Israel"),
    ("Ashdod", "Ashdod, Israel"),
    ("Ashkelon", "Ashkelon, Israel"),
    ("Kfar Saba", "Kfar Saba, Israel"),
    ("Raanana", "Ra'anana, Israel"),
    ("Ra'anana", "Ra'anana, Israel"),
    ("Modi'in", "Modi'in, Israel"),
    ("Modiin", "Modi'in, Israel"),
    ("Caesarea", "Caesarea, Israel"),
    ("Yokneam", "Yokneam, Israel"),
    ("Airport City", "Airport City, Israel"),
    ("Nes Ziona", "Nes Ziona, Israel"),
    ("Lod", "Lod, Israel"),
    ("Ramla", "Ramla, Israel"),
    ("Givatayim", "Givatayim, Israel"),
    ("Hod HaSharon", "Hod HaSharon, Israel"),
    ("תל אביב", "Tel Aviv, Israel"),
    ("ירושלים", "Jerusalem, Israel"),
    ("חיפה", "Haifa, Israel"),
    ("הרצליה", "Herzliya, Israel"),
    ("פתח תקווה", "Petah Tikva, Israel"),
    ("רמת גן", "Ramat Gan, Israel"),
    ("ראשון לציון", "Rishon LeZion, Israel"),
    ("רחובות", "Rehovot, Israel"),
    ("נתניה", "Netanya, Israel"),
    ("באר שבע", "Beer Sheva, Israel"),
]

# Countries that are NOT Israel — skip jobs from these
NON_IL_COUNTRIES = [
    "Jordan", "UAE", "UK", "USA", "Germany", "France",
    "Canada", "Australia", "India", "China", "Singapore",
]


def clean_location(raw: str):
    """
    Returns a cleaned location string ready for Nominatim, or None if it should be skipped.

    Handles patterns seen in real data:
      "2 Locations", "3 מיקומים"           → None (no city info)
      "Remote"                              → None
      "Jordan, Multiple Locations, ..."     → None (not Israel)
      "Israel, Multiple Locations, ..."     → None (too broad)
      "Rehovot, IL (Nova HQ)"              → "Rehovot, Israel"
      "Kibbutz Shefayim, Center District, Israel" → "Kibbutz Shefayim, Israel"
    """
    loc = raw.strip()

    # Skip: digit + Locations / מיקומים
    if re.match(r'^\d+\s*(locations?|מיקומים?)$', loc, re.IGNORECASE):
        return None

    # Skip: Remote / Unknown / empty
    if loc.lower() in {"remote", "מרחוק", "עבודה מרחוק", "unknown", ""}:
        return None

    # Skip: non-Israeli country mentioned without Israel
    for country in NON_IL_COUNTRIES:
        if re.search(rf'\b{re.escape(country)}\b', loc, re.IGNORECASE):
            if not re.search(r'\bisrael\b', loc, re.IGNORECASE):
                return None

    # Remove parenthetical content: "(Nova HQ)", "(Remote, GBR)"
    loc = re.sub(r'\(.*?\)', '', loc).strip().strip(',').strip()

    # Remove "Multiple Locations" anywhere
    loc = re.sub(r',?\s*multiple locations', '', loc, flags=re.IGNORECASE).strip()
    loc = re.sub(r'multiple locations,?\s*', '', loc, flags=re.IGNORECASE).strip()

    # Replace ", IL" country code with ", Israel"
    loc = re.sub(r',?\s*\bIL\b', '', loc).strip()

    # Remove leftover commas and whitespace
    loc = re.sub(r',\s*,', ',', loc).strip(' ,')

    # If nothing meaningful left, or only "Israel" (too broad)
    if not loc or loc.lower() == "israel":
        return None

    # Still has "Locations" after cleaning → no city info
    if re.search(r'\blocations?\b', loc, re.IGNORECASE):
        return None

    # Try to extract a known Israeli city and return the canonical Nominatim query
    for display, query in KNOWN_IL_CITIES:
        if re.search(rf'\b{re.escape(display)}\b', loc, re.IGNORECASE):
            return query

    # Return the cleaned string as-is (Nominatim will try it)
    return loc


def geocode_location(query: str):
    """Returns (Decimal lat, Decimal lng) or (None, None). Includes Nominatim rate-limit sleep.
    Tries with country_codes='il' first, then without (fallback for kibbutz/village names)."""
    attempts = [
        {"country_codes": "il"},
        {},  # no country restriction fallback
    ]
    for kwargs in attempts:
        time.sleep(1.1)
        try:
            result = _geolocator.geocode(query, timeout=10, **kwargs)
            if result:
                return (
                    Decimal(str(round(result.latitude, 6))),
                    Decimal(str(round(result.longitude, 6))),
                )
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            print(f"  ⚠️  Nominatim error for '{query}': {e}")
    return None, None


def scan_all_jobs():
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


def main():
    print(f"Scanning table '{TABLE_NAME}' ...")
    all_jobs = scan_all_jobs()
    print(f"Total jobs: {len(all_jobs)}")

    missing = [
        job for job in all_jobs
        if job.get("latitude") is None or job.get("longitude") is None
    ]
    print(f"Jobs without coordinates: {len(missing)}\n")

    if not missing:
        print("Nothing to do.")
        return

    updated = 0
    skipped = 0
    failed = 0

    for i, job in enumerate(missing, start=1):
        job_id = job.get("jobId", "?")
        raw_location = job.get("location", "")
        title = job.get("title", "")[:50]

        print(f"[{i}/{len(missing)}] {title!r}")
        print(f"  raw location: {raw_location!r}")

        query = clean_location(raw_location)

        if query is None:
            print(f"  ⏭  Skipped (no usable city)")
            skipped += 1
            continue

        print(f"  querying: {query!r}")
        lat, lng = geocode_location(query)

        if lat is None:
            print(f"  ✗  No result from Nominatim")
            failed += 1
            continue

        table.update_item(
            Key={"jobId": job_id},
            UpdateExpression="SET latitude = :lat, longitude = :lng",
            ExpressionAttributeValues={":lat": lat, ":lng": lng},
        )
        print(f"  ✓  {float(lat):.4f}, {float(lng):.4f}")
        updated += 1

    print(f"\nDone. Updated={updated}, Skipped={skipped}, Failed={failed}")


if __name__ == "__main__":
    main()
