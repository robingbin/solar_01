"""
Solar Credit Tracker - Billing cycle backend tests (iteration 2).

Covers newly-added bimonthly billing:
- GET  /api/billing         (current + past)
- POST /api/billing/close   (valid + end<start rejection)
- PUT  /api/billing/cycles/:id
- DELETE /api/billing/cycles/:id (and auto _ensure_open_cycle)
- GET  /api/dashboard billing key
- GET  /api/backup includes billing_cycles / POST /api/restore rehydrates
- POST /api/seed resets billing (one open cycle)
- DELETE /api/wipe clears readings + billing_cycles

Runs after /app/backend/tests/backend_test.py -- pytest orders test files
alphabetically by default so this file executes second. All tests live in
ONE class to stay single-worker under xdist loadscope.
"""

import os
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
TIMEOUT = 30


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestBillingCycles:
    """Sequential test class for the billing feature."""

    # ---------- Fresh state ----------
    def test_01_seed_and_only_one_open_cycle(self, session):
        r = session.post(f"{API}/seed", params={"days": 30}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["success"] is True

        r2 = session.get(f"{API}/billing", timeout=TIMEOUT)
        assert r2.status_code == 200
        body = r2.json()
        assert "current" in body and "past" in body
        assert body["current"]["closed"] is False
        assert body["past"] == []
        # earliest reading date == cycle start
        readings = session.get(f"{API}/readings", params={"limit": 100}, timeout=TIMEOUT).json()["items"]
        earliest = min(readings, key=lambda r: r["date"])["date"]
        assert body["current"]["start_date"] == earliest
        pytest.cycle_start = body["current"]["start_date"]
        pytest.open_cycle_id = body["current"]["id"]

    # ---------- current cycle stats structure ----------
    def test_02_current_cycle_totals(self, session):
        r = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        c = r["current"]
        for k in [
            "start_date", "closed", "days_elapsed", "days_remaining",
            "cycle_target_days", "total_export", "total_import",
            "net_credit", "entries",
        ]:
            assert k in c, f"missing key {k}"
        assert c["cycle_target_days"] == 60
        assert c["days_elapsed"] >= 0
        assert c["entries"] >= 1
        assert round(c["total_export"] - c["total_import"], 2) == round(c["net_credit"], 2)

    # ---------- dashboard exposes billing ----------
    def test_03_dashboard_has_billing_key(self, session):
        r = session.get(f"{API}/dashboard", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "billing" in d and d["billing"] is not None
        assert "current" in d["billing"]
        assert "last_closed" in d["billing"]
        assert d["billing"]["current"]["closed"] is False
        assert d["billing"]["last_closed"] is None  # nothing closed yet

    # ---------- reject end_date before start ----------
    def test_04_close_rejects_end_before_start(self, session):
        start = pytest.cycle_start
        bad_end = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
        r = session.post(
            f"{API}/billing/close",
            json={"end_date": bad_end, "notes": "TEST bad"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 400
        assert "before" in r.json()["detail"].lower()

    # ---------- close bill successfully ----------
    def test_05_close_bill_success(self, session):
        _ = session.get(f"{API}/billing", timeout=TIMEOUT).json()["current"]
        end_date = date.today().isoformat()
        payload = {"end_date": end_date, "notes": "TEST cycle close"}
        r = session.post(f"{API}/billing/close", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "closed" in body and "next" in body
        assert body["closed"]["closed"] is True
        assert body["closed"]["end_date"] == end_date
        assert body["closed"]["notes"] == "TEST cycle close"
        assert round(
            body["closed"]["closing_export"] - body["closed"]["closing_import"], 2
        ) == round(body["closed"]["closing_credit"], 2)
        # next cycle starts end_date + 1
        assert body["next"]["closed"] is False
        assert body["next"]["start_date"] == (
            date.fromisoformat(end_date) + timedelta(days=1)
        ).isoformat()

        # Verify past list grew
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        assert len(overview["past"]) == 1
        assert overview["past"][0]["id"] == body["closed"]["id"]
        pytest.closed_cycle_id = body["closed"]["id"]
        pytest.new_open_cycle_id = body["next"]["id"]

    # ---------- dashboard now shows last_closed ----------
    def test_06_dashboard_last_closed_populated(self, session):
        d = session.get(f"{API}/dashboard", timeout=TIMEOUT).json()
        assert d["billing"]["last_closed"] is not None
        assert d["billing"]["last_closed"]["id"] == pytest.closed_cycle_id
        assert d["billing"]["current"]["closed"] is False
        assert d["billing"]["current"]["id"] == pytest.new_open_cycle_id

    # ---------- update closed cycle recomputes closing_* ----------
    def test_07_update_closed_cycle(self, session):
        cid = pytest.closed_cycle_id
        # Keep same start; move end forward one day - stats should still be computed
        r = session.put(
            f"{API}/billing/cycles/{cid}",
            json={"notes": "TEST edited notes"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["notes"] == "TEST edited notes"

    # ---------- backup contains billing_cycles ----------
    def test_08_backup_includes_billing(self, session):
        r = session.get(f"{API}/backup", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert "billing_cycles" in data
        assert isinstance(data["billing_cycles"], list)
        ids = {c["id"] for c in data["billing_cycles"]}
        assert pytest.closed_cycle_id in ids
        assert pytest.new_open_cycle_id in ids
        pytest.backup_payload = data

    # ---------- restore rehydrates billing_cycles ----------
    def test_09_restore_rehydrates(self, session):
        payload = pytest.backup_payload
        r = session.post(f"{API}/restore", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        past_ids = {c["id"] for c in overview["past"]}
        assert pytest.closed_cycle_id in past_ids
        assert overview["current"]["closed"] is False

    # ---------- delete past cycle removes it ----------
    def test_10_delete_past_cycle(self, session):
        r = session.delete(f"{API}/billing/cycles/{pytest.closed_cycle_id}", timeout=TIMEOUT)
        assert r.status_code == 200
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        past_ids = {c["id"] for c in overview["past"]}
        assert pytest.closed_cycle_id not in past_ids

    # ---------- deleting open cycle re-creates one ----------
    def test_11_delete_open_cycle_recreates(self, session):
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        open_id = overview["current"]["id"]
        r = session.delete(f"{API}/billing/cycles/{open_id}", timeout=TIMEOUT)
        assert r.status_code == 200
        # A brand-new open cycle should have been auto-created
        overview2 = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        assert overview2["current"]["closed"] is False
        assert overview2["current"]["id"] != open_id

    # ---------- wipe clears billing ----------
    def test_12_wipe_clears_billing(self, session):
        r = session.delete(f"{API}/wipe", timeout=TIMEOUT)
        assert r.status_code == 200
        # billing endpoint ensures open cycle -> so past=[]
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        assert overview["past"] == []
        assert overview["current"]["closed"] is False

    # ---------- final seed 45 days for demo ----------
    def test_13_final_seed_45(self, session):
        r = session.post(f"{API}/seed", params={"days": 45}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["count"] == 45
        overview = session.get(f"{API}/billing", timeout=TIMEOUT).json()
        assert overview["past"] == []
        assert overview["current"]["closed"] is False
        # start_date should match earliest reading (45 days ago)
        expected = (date.today() - timedelta(days=44)).isoformat()
        assert overview["current"]["start_date"] == expected
