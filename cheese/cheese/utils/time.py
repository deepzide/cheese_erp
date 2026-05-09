# Copyright (c) 2024
# License: MIT

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
DISPLAY_TZ = ZoneInfo("America/Montevideo")


def utcnow():
	"""Aware UTC datetime for scheduler comparisons."""
	return datetime.now(UTC)


def to_iso(dt):
	"""Serialize datetime to ISO-8601 with explicit +00:00 offset for API output."""
	if dt is None:
		return None
	if dt.tzinfo is None:
		dt = dt.replace(tzinfo=UTC)
	return dt.isoformat()


def uy_slot_time_to_utc(date_obj, time_str):
	"""Convert Montevideo wall-clock date+time to aware UTC datetime.
	Slots are defined in Uruguay local time — must interpret as such."""
	if date_obj is None or time_str is None:
		return None
	time_part = str(time_str).split(".")[0]
	if len(time_part) == 5:
		time_part = f"{time_part}:00"
	parts = time_part.split(":")
	h = int(parts[0])
	m = int(parts[1]) if len(parts) > 1 else 0
	s = int(parts[2]) if len(parts) > 2 else 0
	naive = datetime.combine(date_obj, datetime.min.time().replace(hour=h, minute=m, second=s))
	return naive.replace(tzinfo=DISPLAY_TZ).astimezone(UTC)
