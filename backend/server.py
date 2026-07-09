"""
Solar Credit Tracker - FastAPI backend.

Manages TNEB solar import/export meter readings and computes:
- daily export/import usage
- running totals
- current solar credit balance

All persisted data lives in MongoDB. IDs are UUID strings so the API is
safe to serialize to JSON without ObjectId acrobatics.
"""

from __future__ import annotations

import io
import json
import logging
import os
import random
import uuid
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

READINGS = db["readings"]
SETTINGS = db["settings"]

app = FastAPI(title="Solar Credit Tracker API", version="1.0.0")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ReadingIn(BaseModel):
    """Payload the client sends when creating/updating a reading."""

    model_config = ConfigDict(extra="ignore")

    date: str  # YYYY-MM-DD
    current_export: float
    current_import: float
    notes: Optional[str] = ""
    # Optional bootstrap values used only when there is no prior reading.
    initial_export: Optional[float] = None
    initial_import: Optional[float] = None


class Reading(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    previous_export: float = 0.0
    current_export: float = 0.0
    export_unit: float = 0.0
    previous_import: float = 0.0
    current_import: float = 0.0
    import_unit: float = 0.0
    running_export: float = 0.0
    running_import: float = 0.0
    credit_unit: float = 0.0
    net_today: float = 0.0
    notes: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class SettingsModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: "singleton")
    owner_name: str = "GeeBin A R"
    consumer_number: str = "1234567890"
    service_number: str = ""
    solar_capacity: str = "3.72 kW"
    meter_number: str = ""
    installation_date: str = "2024-03-15"
    address: str = ""
    phone: str = ""
    email: str = ""
    theme: str = "light"
    currency: str = "INR"
    measurement_unit: str = "kWh"
    tariff_rate: float = 8.0  # used for estimated savings
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _round(n: float) -> float:
    return round(float(n), 2)


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc.pop("_id", None)
    return doc


async def _all_readings_sorted() -> List[Dict[str, Any]]:
    cursor = READINGS.find({}, {"_id": 0}).sort("date", 1)
    return await cursor.to_list(length=100000)


async def _recalculate_chain(
    initial_export: Optional[float] = None,
    initial_import: Optional[float] = None,
) -> None:
    """Recompute every reading's derived fields based on date order.

    When ``initial_export`` / ``initial_import`` are given they seed the very
    first reading (used for the first-ever entry). Otherwise the first row's
    stored ``previous_*`` values are trusted.
    """

    readings = await _all_readings_sorted()
    if not readings:
        return

    running_export = 0.0
    running_import = 0.0
    prev_export_meter: Optional[float] = None
    prev_import_meter: Optional[float] = None

    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, r in enumerate(readings):
        if idx == 0:
            if initial_export is not None:
                r["previous_export"] = float(initial_export)
            if initial_import is not None:
                r["previous_import"] = float(initial_import)
        else:
            r["previous_export"] = prev_export_meter or 0.0
            r["previous_import"] = prev_import_meter or 0.0

        r["export_unit"] = _round(r["current_export"] - r["previous_export"])
        r["import_unit"] = _round(r["current_import"] - r["previous_import"])
        r["net_today"] = _round(r["export_unit"] - r["import_unit"])
        running_export += r["export_unit"]
        running_import += r["import_unit"]
        r["running_export"] = _round(running_export)
        r["running_import"] = _round(running_import)
        r["credit_unit"] = _round(running_export - running_import)
        r["previous_export"] = _round(r["previous_export"])
        r["previous_import"] = _round(r["previous_import"])
        r["current_export"] = _round(r["current_export"])
        r["current_import"] = _round(r["current_import"])
        r["updated_at"] = now_iso

        await READINGS.update_one({"id": r["id"]}, {"$set": r})

        prev_export_meter = r["current_export"]
        prev_import_meter = r["current_import"]


async def _get_settings_doc() -> Dict[str, Any]:
    doc = await SETTINGS.find_one({"id": "singleton"}, {"_id": 0})
    if not doc:
        defaults = SettingsModel().model_dump()
        await SETTINGS.insert_one(dict(defaults))
        return defaults
    return doc


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------


@api.get("/settings")
async def get_settings():
    return await _get_settings_doc()


@api.put("/settings")
async def update_settings(payload: Dict[str, Any]):
    current = await _get_settings_doc()
    payload.pop("_id", None)
    payload.pop("id", None)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged = {**current, **payload}
    await SETTINGS.update_one({"id": "singleton"}, {"$set": merged}, upsert=True)
    return await _get_settings_doc()


# ---------------------------------------------------------------------------
# Readings CRUD
# ---------------------------------------------------------------------------


@api.get("/readings/latest")
async def latest_reading():
    doc = await READINGS.find_one({}, {"_id": 0}, sort=[("date", -1)])
    return {"reading": doc}


@api.get("/readings")
async def list_readings(
    search: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
    sort: str = "date",
    order: str = "desc",
):
    query: Dict[str, Any] = {}
    if year and month:
        m = f"{month:02d}"
        query["date"] = {"$regex": f"^{year}-{m}-"}
    elif year:
        query["date"] = {"$regex": f"^{year}-"}
    elif month:
        m = f"{month:02d}"
        query["date"] = {"$regex": f"^\\d{{4}}-{m}-"}

    if search:
        s = search.strip()
        query["$or"] = [
            {"date": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
        ]

    total = await READINGS.count_documents(query)
    direction = -1 if order.lower() == "desc" else 1
    skip = max(0, (page - 1) * limit)
    cursor = READINGS.find(query, {"_id": 0}).sort(sort, direction).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items, "total": total, "page": page, "limit": limit}


@api.post("/readings")
async def create_reading(payload: ReadingIn):
    # Validate date
    try:
        date_cls.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    if payload.current_export < 0 or payload.current_import < 0:
        raise HTTPException(status_code=400, detail="Readings cannot be negative.")

    # Prevent duplicates on the same date
    if await READINGS.find_one({"date": payload.date}):
        raise HTTPException(
            status_code=400,
            detail=f"A reading for {payload.date} already exists.",
        )

    # Find the reading immediately before this date (chronologically)
    prev = await READINGS.find_one(
        {"date": {"$lt": payload.date}}, {"_id": 0}, sort=[("date", -1)]
    )

    if prev:
        prev_export = float(prev["current_export"])
        prev_import = float(prev["current_import"])
    else:
        # First entry ever - use initial values (defaults to the new reading itself if not provided)
        prev_export = (
            float(payload.initial_export)
            if payload.initial_export is not None
            else float(payload.current_export)
        )
        prev_import = (
            float(payload.initial_import)
            if payload.initial_import is not None
            else float(payload.current_import)
        )

    if payload.current_export < prev_export:
        raise HTTPException(
            status_code=400,
            detail=f"Current export ({payload.current_export}) is less than previous ({prev_export}).",
        )
    if payload.current_import < prev_import:
        raise HTTPException(
            status_code=400,
            detail=f"Current import ({payload.current_import}) is less than previous ({prev_import}).",
        )

    reading = Reading(
        date=payload.date,
        previous_export=prev_export,
        current_export=float(payload.current_export),
        previous_import=prev_import,
        current_import=float(payload.current_import),
        notes=payload.notes or "",
    )
    doc = reading.model_dump()
    await READINGS.insert_one(doc)

    # Recompute the full chain to keep running totals consistent even if
    # entries are added out of chronological order.
    await _recalculate_chain()

    saved = await READINGS.find_one({"id": reading.id}, {"_id": 0})
    return saved


@api.put("/readings/{reading_id}")
async def update_reading(reading_id: str, payload: ReadingIn):
    existing = await READINGS.find_one({"id": reading_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reading not found")

    try:
        date_cls.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    # Prevent duplicate dates against other rows
    duplicate = await READINGS.find_one({"date": payload.date, "id": {"$ne": reading_id}})
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"A different reading already exists for {payload.date}.",
        )

    update = {
        "date": payload.date,
        "current_export": float(payload.current_export),
        "current_import": float(payload.current_import),
        "notes": payload.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await READINGS.update_one({"id": reading_id}, {"$set": update})

    await _recalculate_chain()

    # After recalc, validate no negative deltas
    fixed = await READINGS.find_one({"id": reading_id}, {"_id": 0})
    if fixed and (fixed["export_unit"] < 0 or fixed["import_unit"] < 0):
        raise HTTPException(
            status_code=400,
            detail="Updated values produce a negative unit. Please revise.",
        )
    return fixed


@api.delete("/readings/{reading_id}")
async def delete_reading(reading_id: str):
    result = await READINGS.delete_one({"id": reading_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reading not found")
    await _recalculate_chain()
    return {"success": True}


# ---------------------------------------------------------------------------
# Dashboard, analytics, reports
# ---------------------------------------------------------------------------


@api.get("/dashboard")
async def dashboard():
    readings = await _all_readings_sorted()
    settings_doc = await _get_settings_doc()

    if not readings:
        return {
            "current_credit": 0,
            "todays_export": 0,
            "todays_import": 0,
            "net_today": 0,
            "total_export": 0,
            "total_import": 0,
            "monthly_export": 0,
            "monthly_import": 0,
            "estimated_monthly_savings": 0,
            "lifetime_credit": 0,
            "current_billing_credit": 0,
            "previous_billing_credit": 0,
            "latest": None,
            "trend": [],
            "avg_daily_export": 0,
            "avg_daily_import": 0,
            "avg_daily_net": 0,
            "recent": [],
            "settings": settings_doc,
        }

    latest = readings[-1]
    total_export = latest["running_export"]
    total_import = latest["running_import"]
    current_credit = latest["credit_unit"]

    today_dt = date_cls.fromisoformat(latest["date"])
    month_key = today_dt.strftime("%Y-%m")
    prev_month_dt = (today_dt.replace(day=1) - timedelta(days=1))
    prev_month_key = prev_month_dt.strftime("%Y-%m")

    monthly_export = sum(
        r["export_unit"] for r in readings if r["date"].startswith(month_key)
    )
    monthly_import = sum(
        r["import_unit"] for r in readings if r["date"].startswith(month_key)
    )
    current_billing_credit = monthly_export - monthly_import
    prev_month_export = sum(
        r["export_unit"] for r in readings if r["date"].startswith(prev_month_key)
    )
    prev_month_import = sum(
        r["import_unit"] for r in readings if r["date"].startswith(prev_month_key)
    )
    previous_billing_credit = prev_month_export - prev_month_import

    tariff = float(settings_doc.get("tariff_rate", 8.0))

    avg_daily_export = total_export / max(1, len(readings))
    avg_daily_import = total_import / max(1, len(readings))

    trend = readings[-30:]
    recent = list(reversed(readings))[:5]

    return {
        "current_credit": _round(current_credit),
        "todays_export": _round(latest["export_unit"]),
        "todays_import": _round(latest["import_unit"]),
        "net_today": _round(latest["net_today"]),
        "total_export": _round(total_export),
        "total_import": _round(total_import),
        "monthly_export": _round(monthly_export),
        "monthly_import": _round(monthly_import),
        "estimated_monthly_savings": _round(monthly_export * tariff),
        "lifetime_credit": _round(current_credit),
        "current_billing_credit": _round(current_billing_credit),
        "previous_billing_credit": _round(previous_billing_credit),
        "latest": latest,
        "trend": trend,
        "avg_daily_export": _round(avg_daily_export),
        "avg_daily_import": _round(avg_daily_import),
        "avg_daily_net": _round(avg_daily_export - avg_daily_import),
        "recent": recent,
        "settings": settings_doc,
    }


@api.get("/analytics")
async def analytics():
    readings = await _all_readings_sorted()
    daily = [
        {
            "date": r["date"],
            "export": r["export_unit"],
            "import": r["import_unit"],
            "net": r["net_today"],
            "credit": r["credit_unit"],
        }
        for r in readings
    ]

    monthly_map: Dict[str, Dict[str, float]] = {}
    for r in readings:
        key = r["date"][:7]
        m = monthly_map.setdefault(
            key, {"month": key, "export": 0.0, "import": 0.0, "net": 0.0}
        )
        m["export"] += r["export_unit"]
        m["import"] += r["import_unit"]
        m["net"] += r["net_today"]

    monthly = sorted(monthly_map.values(), key=lambda x: x["month"])
    for m in monthly:
        m["export"] = _round(m["export"])
        m["import"] = _round(m["import"])
        m["net"] = _round(m["net"])

    return {"daily": daily, "monthly": monthly}


@api.get("/reports/monthly")
async def monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
):
    month_key = f"{year:04d}-{month:02d}"
    readings = [
        r
        for r in await _all_readings_sorted()
        if r["date"].startswith(month_key)
    ]

    if not readings:
        return {
            "month": month,
            "year": year,
            "total_export": 0,
            "total_import": 0,
            "net_credit": 0,
            "avg_daily_export": 0,
            "avg_daily_import": 0,
            "highest_export_day": None,
            "highest_import_day": None,
            "entries": [],
            "count": 0,
        }

    total_export = sum(r["export_unit"] for r in readings)
    total_import = sum(r["import_unit"] for r in readings)
    net_credit = total_export - total_import
    count = len(readings)
    highest_export = max(readings, key=lambda r: r["export_unit"])
    highest_import = max(readings, key=lambda r: r["import_unit"])

    return {
        "month": month,
        "year": year,
        "total_export": _round(total_export),
        "total_import": _round(total_import),
        "net_credit": _round(net_credit),
        "avg_daily_export": _round(total_export / count),
        "avg_daily_import": _round(total_import / count),
        "highest_export_day": {
            "date": highest_export["date"],
            "value": highest_export["export_unit"],
        },
        "highest_import_day": {
            "date": highest_import["date"],
            "value": highest_import["import_unit"],
        },
        "entries": readings,
        "count": count,
    }


# ---------------------------------------------------------------------------
# Backup / restore / seed / wipe
# ---------------------------------------------------------------------------


@api.get("/backup")
async def backup():
    readings = await _all_readings_sorted()
    settings_doc = await _get_settings_doc()
    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "readings": readings,
        "settings": settings_doc,
    }


@api.post("/restore")
async def restore(payload: Dict[str, Any]):
    readings = payload.get("readings") or []
    settings_payload = payload.get("settings")

    if not isinstance(readings, list):
        raise HTTPException(status_code=400, detail="`readings` must be a list.")

    await READINGS.delete_many({})
    if readings:
        cleaned: List[Dict[str, Any]] = []
        for r in readings:
            r = dict(r)
            r.pop("_id", None)
            r.setdefault("id", str(uuid.uuid4()))
            r.setdefault("notes", "")
            cleaned.append(r)
        await READINGS.insert_many(cleaned)
        await _recalculate_chain()

    if isinstance(settings_payload, dict):
        settings_payload.pop("_id", None)
        settings_payload["id"] = "singleton"
        settings_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        await SETTINGS.update_one(
            {"id": "singleton"}, {"$set": settings_payload}, upsert=True
        )

    return {"success": True, "restored": len(readings)}


@api.post("/seed")
async def seed_data(days: int = 30):
    """Generate a plausible ~30 days of readings and replace existing data."""

    await READINGS.delete_many({})

    today = date_cls.today()
    start_export = 8000.00
    start_import = 12300.00

    random.seed(42)
    docs: List[Dict[str, Any]] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        # Daily solar export usually higher during sunny days
        daily_export = round(random.uniform(10.0, 26.0), 2)
        daily_import = round(random.uniform(1.5, 10.0), 2)

        start_export += daily_export
        start_import += daily_import

        docs.append(
            {
                "id": str(uuid.uuid4()),
                "date": d.isoformat(),
                "previous_export": 0.0,
                "current_export": round(start_export, 2),
                "export_unit": 0.0,
                "previous_import": 0.0,
                "current_import": round(start_import, 2),
                "import_unit": 0.0,
                "running_export": 0.0,
                "running_import": 0.0,
                "credit_unit": 0.0,
                "net_today": 0.0,
                "notes": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    if docs:
        await READINGS.insert_many(docs)
        # Seed previous_* values for the first row from an initial baseline.
        await _recalculate_chain(
            initial_export=8000.00,
            initial_import=12300.00,
        )
    return {"success": True, "count": len(docs)}


@api.delete("/wipe")
async def wipe_all(keep_settings: bool = True):
    await READINGS.delete_many({})
    if not keep_settings:
        await SETTINGS.delete_many({})
    return {"success": True}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------


@api.get("/")
async def root():
    return {"message": "Solar Credit Tracker API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("solar-credit-tracker")


@app.on_event("shutdown")
async def _shutdown() -> None:
    client.close()
