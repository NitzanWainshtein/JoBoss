import time
from decimal import Decimal

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

"""
Geocoding helpers for the jobs importer.

This module converts job location strings into latitude and longitude values
using Nominatim, while handling known non-geographic locations such as remote
jobs and geocoding service errors.
"""


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