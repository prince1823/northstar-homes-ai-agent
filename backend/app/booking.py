"""Simulated site-visit booking.

No real calendar system exists for this assignment — this simulates one with a
fixed random failure rate so the prompt's booking-failure handling gets exercised.
"""

import random

BOOKING_FAILURE_RATE = 0.1


def attempt_booking(date: str, time: str, configuration: str) -> dict:
    success = random.random() >= BOOKING_FAILURE_RATE
    return {
        "date": date,
        "time": time,
        "configuration": configuration,
        "success": success,
        "reason": None if success else "Requested slot is unavailable at the site.",
    }
