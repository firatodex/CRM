"""Seed Dyzen Solar CRM staging with rich mock data.

Requires SUPABASE_SERVICE_ROLE_KEY (and optional SUPABASE_URL).
Reads keys from ../.env.local if present.
"""
from __future__ import annotations

import json
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib import error, request

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"

random.seed(42)

STAGES = ["lead", "contacted", "proposal", "active", "dead"]
TEMPS = ["hot", "warm", "cold", None]
SOURCES = [
    "Cold call", "Referral", "JustDial", "IndiaMart", "LinkedIn",
    "Walk-in", "WhatsApp", "Website", "AKRSP cohort", "PM Surya Ghar", "Other",
]
METHODS = ["call", "whatsapp", "email", "meeting", "visit"]
BUSINESS_TYPES = [
    "Solar EPC", "Rooftop installer", "Distributor", "Developer",
    "O&M provider", "Dealer", "Consultant",
]
TERRITORIES = ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Mumbai", "Pune", "Jaipur", "Indore"]
SEGMENTS = ["SME_1-20", "SME_20-50", "SME_50-200", "Enterprise"]
FIRST = [
    "Rajesh", "Priya", "Amit", "Neha", "Vikram", "Sneha", "Karan", "Anjali",
    "Harsh", "Meera", "Suresh", "Pooja", "Nitin", "Kavita", "Deepak", "Ritu",
    "Arjun", "Isha", "Manish", "Divya", "Rohit", "Shreya", "Yash", "Nisha",
]
LAST = [
    "Patel", "Shah", "Mehta", "Desai", "Joshi", "Trivedi", "Parikh", "Dave",
    "Rana", "Chauhan", "Solanki", "Thakkar", "Bhatt", "Modi", "Gandhi", "Kapoor",
]
COMPANIES = [
    "Surya Solaris", "Greenfield Energy", "Helios Power", "Dyzen Partner EPC",
    "Aarav Solar", "Prithvi Renewables", "Ujaas Infra", "NovaWatt",
    "BrightGrid", "Kiran Energy", "Saatvik Solar", "Tata Power Solar Partner",
    "Waaree Channel", "Adani Solar Dealer", "Loom Solar Hub", "Vikram Solar EPC",
    "Gautam Solar Works", "RenewSys Installer", "Premier Rooftop", "Skyline PV",
    "Desert Sun EPC", "Coastal Solar", "AgriVolt Solutions", "Metro Rooftop Co",
    "Village Grid", "Campus Energy", "Factory Power Systems", "Hospital Solar Care",
    "School Rooftop Trust", "Warehouse Watt", "Farm Solar Gujarat", "Textile PV",
    "Hotel Helios", "Mall Energy Ops", "Housing Society Solar", "Temple Trust PV",
    "Municipal Light", "Industrial Park Solar", "Cold Storage Power", "EV Charge Solar",
]
PRODUCTS = [
    "OpsCraft CRM Annual", "Pipeline + Delivery Suite", "Field Force Pack",
    "PM Surya Ghar Tracker", "Dealer Portal Add-on",
]
PAINS = [
    "Missed follow-ups on rooftop leads",
    "No visibility into installation delays",
    "Excel chaos across sales + ops",
    "Subsidy paperwork slipping deadlines",
    "Dealers not updating site status",
    "Cash collection tracking weak",
]
OBJECTIONS = ["price", "competitor", "timing", "need", "authority", "budget", "other"]
OUTCOMES = ["call_booked", "objection_raised", "decision_pending", "no_interest", "wrong_fit", "needs_info"]


def load_env() -> None:
    if not ENV_LOCAL.exists():
        return
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def uid() -> str:
    return str(uuid.uuid4())


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def days_ago(n: int, hour: int = 10) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n, hours=random.randint(0, 8))


def d_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def pg_query(url: str, key: str, sql: str):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = request.Request(
        f"{url.rstrip('/')}/pg/query",
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_rows(rows: list[dict]) -> list[dict]:
    """PostgREST requires every object in a batch to share the same keys."""
    keys: set[str] = set()
    for r in rows:
        keys.update(r.keys())
    ordered = sorted(keys)
    return [{k: r.get(k) for k in ordered} for r in rows]


def rest_insert(url: str, key: str, table: str, rows: list[dict], chunk: int = 80, schema: str = "public"):
    if not rows:
        return
    rows = normalize_rows(rows)
    for i in range(0, len(rows), chunk):
        batch = rows[i : i + chunk]
        body = json.dumps(batch, default=str).encode("utf-8")
        req = request.Request(
            f"{url.rstrip('/')}/rest/v1/{table}",
            data=body,
            headers={
                "Content-Type": "application/json",
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept-Profile": schema,
                "Content-Profile": schema,
                "Prefer": "return=minimal",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=120) as resp:
                if resp.status not in (200, 201):
                    raise RuntimeError(f"{table} insert status {resp.status}")
        except error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{table} insert failed: {e.code} {detail[:800]}") from e


def sql_literal(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        inner = ",".join(sql_literal(x) for x in v)
        return f"ARRAY[{inner}]::text[]"
    if isinstance(v, dict):
        s = json.dumps(v).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    load_env()
    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "http://192.168.1.69:8000"
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    schema = (
        os.environ.get("SUPABASE_SCHEMA")
        or os.environ.get("VITE_SUPABASE_SCHEMA")
        or "public"
    )
    if not key:
        print("Missing SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    print(f"Seeding {url} schema {schema} …")

    # Wipe app tables (keep schema). Order respects FKs.
    wipe = f"""
    set search_path to {schema};
    truncate table
      win_loss_analysis, forecast_log, sales_activity_targets, objection_playbook,
      lead_scoring_rules, ideal_customer_profile,
      health_history, customer_health,
      implementation_tasks, implementation_blockers, implementation_milestones, implementations,
      deal_ownership_history, audit_log,
      lead_contacts, final_step_clients, pipeline_snapshots,
      onboarding_steps, payments, deals, tasks, contact_log, clients, users
    restart identity cascade;
    """
    pg_query(url, key, wipe)
    print("Cleared existing rows.")

    # ── users ──
    users = [
        {"id": uid(), "email": "dosaniafzal92@gmail.com", "name": "Afzal Dosani", "phone": "9876500001", "role": "admin", "department": "Leadership", "is_active": True},
        {"id": uid(), "email": "priya.sales@dyzen.solar", "name": "Priya Shah", "phone": "9876500002", "role": "sales", "department": "Sales", "is_active": True},
        {"id": uid(), "email": "amit.delivery@dyzen.solar", "name": "Amit Mehta", "phone": "9876500003", "role": "delivery", "department": "Delivery", "is_active": True},
        {"id": uid(), "email": "neha.ops@dyzen.solar", "name": "Neha Desai", "phone": "9876500004", "role": "ops", "department": "Operations", "is_active": True},
        {"id": uid(), "email": "vikram.field@dyzen.solar", "name": "Vikram Rana", "phone": "9876500005", "role": "delivery", "department": "Field", "is_active": True},
        {"id": uid(), "email": "viewer@dyzen.solar", "name": "Read Only", "phone": None, "role": "viewer", "department": "Finance", "is_active": True},
    ]
    rest_insert(url, key, "users", users, schema=schema)
    admin_id = users[0]["id"]
    sales_ids = [users[1]["id"], users[0]["id"]]
    delivery_ids = [users[2]["id"], users[4]["id"]]

    # ── clients (~90) ──
    # Stage mix: more pipeline, solid active + dead for dashboards
    stage_plan = (
        ["lead"] * 22
        + ["contacted"] * 20
        + ["proposal"] * 18
        + ["active"] * 20
        + ["dead"] * 12
    )
    random.shuffle(stage_plan)

    clients = []
    for i, stage in enumerate(stage_plan):
        created = days_ago(random.randint(5, 120))
        company = f"{COMPANIES[i % len(COMPANIES)]} {100 + i}" if i >= len(COMPANIES) else COMPANIES[i]
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        temp = random.choice(TEMPS) if stage != "dead" else random.choice(["cold", None])
        revenue = random.choice([45000, 75000, 120000, 180000, 250000, 350000, 500000, 750000, 1200000])
        territory = random.choice(TERRITORIES)
        row = {
            "id": uid(),
            "created_at": iso(created),
            "updated_at": iso(days_ago(random.randint(0, 10))),
            "name": name,
            "company": company,
            "business_type": random.choice(BUSINESS_TYPES),
            "phone": f"9{random.randint(100000000, 999999999)}",
            "email": f"{name.split()[0].lower()}.{i}@example.in",
            "website": f"https://www.{company.lower().replace(' ', '')[:18]}.in" if random.random() > 0.4 else None,
            "stage": stage,
            "temperature": temp,
            "source": random.choice(SOURCES),
            "potential_revenue": revenue if stage != "dead" else revenue // 2,
            "pain_point": random.choice(PAINS),
            "notes": f"{territory} · rooftop/commercial pipeline · mock seed",
            "next_action": None,
            "next_action_due": None,
            "next_action_time": None,
            "last_contacted_at": None,
            "proposal_sent_at": None,
            "proposal_value": None,
            "current_solution": random.choice([None, "Excel", "WhatsApp groups", "Zoho", "Nothing"]),
            "objection": None,
            "territory": territory,
            "segment": random.choice(SEGMENTS),
            "qualification_status": random.choice(["lead_unqualified", "lead_qualified", "needs_review"]),
            "icp_match_score": random.randint(20, 95),
            "lead_score": random.randint(10, 100),
            "primary_contact_role": random.choice([None, "economic_buyer", "technical_buyer", "user_champion", "influencer"]),
            "internal_champion_name": None,
            "internal_champion_identified": False,
            "created_by": admin_id,
            "owned_by": random.choice(sales_ids),
            "deal_stalled_flag": False,
            "expected_stage_duration_days": random.choice([7, 14, 21, 30]),
            "stage_days_count": random.randint(1, 40),
        }

        if stage in ("contacted", "proposal", "active"):
            row["last_contacted_at"] = iso(days_ago(random.randint(0, 14)))
            row["next_action"] = random.choice([
                "Follow-up call", "Send revised quote", "Site visit", "Demo walkthrough", "Collect documents",
            ])
            due_offset = random.randint(-3, 10)
            row["next_action_due"] = d_ago(-due_offset) if due_offset < 0 else (date.today() + timedelta(days=due_offset)).isoformat()
            if random.random() > 0.5:
                row["next_action_time"] = f"{random.choice([10, 11, 12, 15, 16]):02d}:{random.choice(['00', '30'])}"

        if stage == "proposal":
            sent = days_ago(random.randint(1, 28))
            row["proposal_sent_at"] = iso(sent)
            row["proposal_value"] = revenue
            if random.random() > 0.7:
                row["deal_stalled_flag"] = True
                row["deal_stalled_since"] = iso(days_ago(random.randint(5, 20)))
                row["objection"] = random.choice(["Price vs Zoho", "Waiting on partner approval", "Budget freeze"])

        if stage == "active":
            won = days_ago(random.randint(2, 90))
            row["won_at"] = iso(won)
            row["won_from_stage"] = random.choice(["proposal", "contacted"])
            row["proposal_sent_at"] = iso(won - timedelta(days=random.randint(7, 40)))
            row["proposal_value"] = revenue
            row["qualification_status"] = "lead_qualified"
            row["internal_champion_identified"] = True
            row["internal_champion_name"] = f"{random.choice(FIRST)} {random.choice(LAST)}"
            row["discovery_completed_at"] = iso(won - timedelta(days=random.randint(20, 60)))
            row["discovery_team_size"] = random.choice(["2_5", "5_10", "10_plus"])
            row["discovery_monthly_leads"] = random.choice(["50_200", "200_500", "500_plus"])
            row["discovery_current_tool"] = random.choice(["excel", "whatsapp", "other_crm", "mix"])
            row["discovery_lost_deals"] = random.choice(["yes", "no", "not_sure"])
            row["discovery_decision_maker"] = random.choice(["yes", "partially"])
            row["discovery_switch_openness"] = "hot"

        if stage == "dead":
            row["notes"] = "Closed lost — mock seed. " + random.choice([
                "Chose competitor", "No budget", "Gone silent", "Wrong fit (residential only)",
            ])
            row["last_contacted_at"] = iso(days_ago(random.randint(20, 80)))

        if stage in ("proposal", "contacted") and random.random() > 0.55:
            row["discovery_team_size"] = random.choice(["just_me", "2_5", "5_10"])
            row["discovery_current_tool"] = random.choice(["nothing", "excel", "whatsapp"])

        clients.append(row)

    rest_insert(url, key, "clients", clients, schema=schema)
    print(f"Inserted {len(clients)} clients.")

    by_stage = {s: [c for c in clients if c["stage"] == s] for s in STAGES}

    # ── lead_contacts ──
    lead_contacts = []
    for c in clients:
        if random.random() > 0.55:
            continue
        for _ in range(random.randint(1, 3)):
            lead_contacts.append({
                "id": uid(),
                "client_id": c["id"],
                "name": f"{random.choice(FIRST)} {random.choice(LAST)}",
                "designation": random.choice(["Owner", "Ops Manager", "Accounts", "Site Engineer", "Partner"]),
                "phone": f"9{random.randint(100000000, 999999999)}",
                "created_at": iso(days_ago(random.randint(1, 60))),
            })
    rest_insert(url, key, "lead_contacts", lead_contacts, schema=schema)

    # ── contact_log ──
    contact_logs = []
    for c in clients:
        n = {"lead": random.randint(0, 2), "contacted": random.randint(2, 5),
             "proposal": random.randint(3, 7), "active": random.randint(4, 10),
             "dead": random.randint(2, 5)}[c["stage"]]
        for j in range(n):
            when = days_ago(random.randint(1, 90))
            outcome = random.choice(OUTCOMES) if c["stage"] != "lead" else random.choice([None, "needs_info", "call_booked"])
            obj = random.choice(OBJECTIONS) if outcome == "objection_raised" else None
            contact_logs.append({
                "id": uid(),
                "client_id": c["id"],
                "contacted_at": iso(when),
                "method": random.choice(METHODS),
                "note": f"Spoke about {random.choice(PAINS).lower()}",
                "note_what_happened": random.choice([
                    "Discussed rooftop pipeline tracking gaps",
                    "Walked through demo of Kanban + delivery tracker",
                    "Shared pricing sheet and case study",
                    "Prospect asked for ROI vs Excel process",
                    "Confirmed decision maker and budget window",
                ]),
                "note_what_next": random.choice([
                    "Send proposal by Friday",
                    "Schedule site demo",
                    "Follow up on WhatsApp",
                    "Introduce delivery lead",
                    None,
                ]),
                "progress": random.random() > 0.65,
                "created_by": random.choice(sales_ids),
                "contact_outcome": outcome,
                "objection_type": obj,
                "objection_counter_used": "Shared ROI one-pager" if obj == "price" else None,
                "meeting_commitment_made": random.random() > 0.7,
                "commitment_specificity": "Call Tuesday 11am" if random.random() > 0.7 else None,
                "prospect_confirmed": random.random() > 0.5,
                "discovery_completed": c["stage"] in ("proposal", "active") and j == 0,
                "call_summary_json": {
                    "problem_identified": random.choice(PAINS),
                    "stakeholders": [c["name"]],
                    "next_step": "Follow up",
                } if random.random() > 0.6 else None,
            })
    rest_insert(url, key, "contact_log", contact_logs, schema=schema)
    print(f"Inserted {len(contact_logs)} contact logs.")

    # ── deals + payments + onboarding for proposal/active ──
    deals = []
    payments = []
    onboarding = []
    ownership = []
    implementations = []
    milestones = []
    blockers = []
    impl_tasks = []
    health = []
    health_hist = []
    win_loss = []

    onboarding_labels = [
        "Onboarding call", "Setup & data migration", "Training session", "Go-live", "Client handoff",
    ]

    deal_clients = by_stage["proposal"] + by_stage["active"]
    for c in deal_clients:
        deal_id = uid()
        value = float(c["potential_revenue"] or 150000)
        created = c.get("won_at") or c.get("proposal_sent_at") or c["created_at"]
        owner = random.choice(sales_ids)
        delivery = random.choice(delivery_ids)
        is_active = c["stage"] == "active"
        deals.append({
            "id": deal_id,
            "created_at": created,
            "updated_at": iso(days_ago(random.randint(0, 5))),
            "client_id": c["id"],
            "company": c["company"],
            "stage": "active" if is_active else "proposal",
            "deal_value": value,
            "product_sold": random.choice(PRODUCTS),
            "payment_type": random.choice(["milestone", "monthly", "lump_sum"]),
            "subscription_type": random.choice(["one_time", "annual", "monthly"]),
            "subscription_start": d_ago(random.randint(0, 60)),
            "subscription_end": None,
            "delivery_status": is_active and random.random() > 0.55,
            "delivered_at": d_ago(random.randint(0, 20)) if is_active and random.random() > 0.55 else None,
            "notes": "Mock seeded deal",
            "deal_owner_id": owner,
            "delivery_owner_id": delivery if is_active else None,
            "implementation_status": random.choice(["not_started", "in_progress", "on_track", "at_risk", "delivered"]) if is_active else "not_started",
            "created_by": admin_id,
            "days_in_proposal_stage": random.randint(3, 35),
            "deal_momentum_score": random.randint(2, 10),
            "proposal_version_count": random.randint(1, 4),
            "competitive_situation": random.choice(["vs_specific_competitor", "vs_donothing", "vs_multiple", "unknown"]),
            "forecast_status": "closed_won" if is_active else random.choice(["on_track", "at_risk"]),
            "win_reason": random.choice(["better_fit", "price", "relationship", "timing"]) if is_active else None,
            "contract_term_months": random.choice([12, 24]),
            "expansion_opportunity_value": random.choice([0, 25000, 50000, 100000]),
        })

        half = round(value / 2)
        paid_first = is_active or random.random() > 0.4
        payments.append({
            "id": uid(), "deal_id": deal_id, "label": "Advance (50%)", "amount": half,
            "due_date": d_ago(random.randint(0, 40)), "paid": paid_first,
            "paid_at": d_ago(random.randint(0, 30)) if paid_first else None, "created_by": owner,
        })
        payments.append({
            "id": uid(), "deal_id": deal_id, "label": "Final payment (50%)", "amount": value - half,
            "due_date": (date.today() + timedelta(days=random.randint(5, 45))).isoformat(),
            "paid": is_active and random.random() > 0.5,
            "paid_at": d_ago(random.randint(0, 10)) if (is_active and random.random() > 0.5) else None,
            "created_by": owner,
        })
        if random.random() > 0.7:
            payments.append({
                "id": uid(), "deal_id": deal_id, "label": "Training add-on", "amount": 15000,
                "due_date": (date.today() + timedelta(days=20)).isoformat(),
                "paid": False, "paid_at": None, "created_by": owner,
            })

        for idx, label in enumerate(onboarding_labels):
            done = is_active and idx < random.randint(1, 5)
            onboarding.append({
                "id": uid(),
                "client_id": c["id"],
                "step_order": idx,
                "step_label": label,
                "due_date": (date.today() + timedelta(days=idx * 7)).isoformat(),
                "completed": done,
                "completed_at": iso(days_ago(random.randint(0, 15))) if done else None,
            })

        ownership.append({
            "id": uid(),
            "deal_id": deal_id,
            "previous_owner_id": None,
            "new_owner_id": owner,
            "change_type": "initial_assignment",
            "changed_by": admin_id,
            "reason": "Seed assignment",
            "changed_at": created,
        })

        if is_active and random.random() > 0.25:
            impl_id = uid()
            status = random.choice(["not_started", "in_progress", "on_track", "at_risk", "blocked", "delivered"])
            assignee = random.choice(delivery_ids)
            implementations.append({
                "id": impl_id,
                "deal_id": deal_id,
                "client_id": c["id"],
                "status": status,
                "status_updated_at": iso(days_ago(random.randint(0, 10))),
                "status_updated_by": assignee,
                "planned_start_date": d_ago(random.randint(0, 30)),
                "actual_start_date": d_ago(random.randint(0, 20)) if status != "not_started" else None,
                "planned_end_date": (date.today() + timedelta(days=random.randint(10, 60))).isoformat(),
                "actual_end_date": d_ago(random.randint(0, 5)) if status == "delivered" else None,
                "completion_percentage": {"not_started": 0, "in_progress": 35, "on_track": 60, "at_risk": 40, "blocked": 25, "delivered": 100}[status],
                "assigned_to": assignee,
                "updated_by": assignee,
            })
            for m_i, m_name in enumerate(["Kickoff", "Data import", "Training", "Go-live"]):
                milestones.append({
                    "id": uid(),
                    "implementation_id": impl_id,
                    "name": m_name,
                    "description": f"{m_name} for {c['company']}",
                    "target_date": (date.today() + timedelta(days=7 * (m_i + 1))).isoformat(),
                    "actual_date": d_ago(1) if status == "delivered" or m_i == 0 else None,
                    "status": "done" if (status == "delivered" or m_i == 0) else "pending",
                    "owner_id": assignee,
                })
            if status in ("at_risk", "blocked") or random.random() > 0.8:
                blockers.append({
                    "id": uid(),
                    "implementation_id": impl_id,
                    "title": random.choice(["Waiting on client Excel export", "GST details missing", "VPN access delayed"]),
                    "description": "Mock blocker for staging demos",
                    "severity": random.choice(["low", "medium", "high"]),
                    "reported_by": assignee,
                    "assigned_to": assignee,
                    "status": "open",
                })
            for t_i, t_name in enumerate(["Collect login list", "Map pipeline stages", "Import historical leads"]):
                impl_tasks.append({
                    "id": uid(),
                    "implementation_id": impl_id,
                    "task_name": t_name,
                    "owner_id": assignee,
                    "status": "done" if t_i == 0 else "pending",
                    "due_date": (date.today() + timedelta(days=t_i * 3)).isoformat(),
                    "completed_date": d_ago(1) if t_i == 0 else None,
                    "task_order": t_i,
                })

            score = random.randint(35, 95)
            health.append({
                "id": uid(),
                "client_id": c["id"],
                "delivery_score": score,
                "engagement_score": random.randint(40, 95),
                "payment_score": random.randint(50, 100),
                "usage_score": random.randint(30, 90),
                "satisfaction_score": random.randint(40, 95),
                "is_at_churn_risk": score < 55,
                "churn_risk_reason": "Low engagement after go-live" if score < 55 else None,
                "last_assessment_date": iso(days_ago(random.randint(0, 14))),
            })
            for h in range(3):
                health_hist.append({
                    "id": uid(),
                    "client_id": c["id"],
                    "health_score": score - random.randint(0, 15) + h * 3,
                    "health_status": "at_risk" if score < 55 else "healthy",
                    "recorded_at": iso(days_ago(30 - h * 10)),
                })

        if is_active and random.random() > 0.4:
            win_loss.append({
                "id": uid(),
                "user_id": owner,
                "deal_id": deal_id,
                "outcome": "won",
                "primary_reason": random.choice(["better_fit", "price", "relationship", "timing", "urgency"]),
                "secondary_reasons": ["relationship"],
                "competitive_context": "vs_specific_competitor",
                "estimated_deal_value": value,
                "lessons_learned": "Champion in ops accelerated close.",
            })

    # lost deals from dead clients (synthetic deals for win/loss)
    for c in by_stage["dead"][:8]:
        deal_id = uid()
        value = float(c["potential_revenue"] or 100000)
        deals.append({
            "id": deal_id,
            "created_at": c["created_at"],
            "updated_at": iso(days_ago(random.randint(0, 5))),
            "client_id": c["id"],
            "company": c["company"],
            "stage": "dead",
            "deal_value": value,
            "product_sold": random.choice(PRODUCTS),
            "payment_type": "milestone",
            "subscription_type": "annual",
            "subscription_start": d_ago(60),
            "subscription_end": None,
            "delivery_status": False,
            "delivered_at": None,
            "notes": "Closed lost — mock seed",
            "deal_owner_id": random.choice(sales_ids),
            "delivery_owner_id": None,
            "implementation_status": "not_started",
            "deal_assigned_at": None,
            "delivery_assigned_at": None,
            "assigned_by": None,
            "created_by": admin_id,
            "updated_by": None,
            "delivery_start_date": None,
            "delivery_target_date": None,
            "delivery_actual_date": None,
            "customer_sign_off_date": None,
            "days_in_proposal_stage": random.randint(5, 40),
            "deal_momentum_score": random.randint(1, 4),
            "proposal_version_count": random.randint(1, 3),
            "competitive_situation": random.choice(["vs_specific_competitor", "vs_donothing"]),
            "win_reason": None,
            "loss_reason": random.choice(["price", "competitor", "timeline", "budget", "need"]),
            "forecast_status": "closed_lost",
            "contract_term_months": 12,
            "expected_renewal_date": None,
            "expansion_opportunity_value": 0,
        })
        win_loss.append({
            "id": uid(),
            "user_id": random.choice(sales_ids),
            "deal_id": deal_id,
            "outcome": "lost",
            "primary_reason": random.choice(["price", "competitor", "timeline", "budget"]),
            "secondary_reasons": ["timing"],
            "competitive_context": "vs_donothing",
            "estimated_deal_value": value,
            "lessons_learned": "Offer phased rollout earlier next time.",
        })

    rest_insert(url, key, "deals", deals, schema=schema)
    rest_insert(url, key, "payments", payments, schema=schema)
    rest_insert(url, key, "onboarding_steps", onboarding, schema=schema)
    rest_insert(url, key, "deal_ownership_history", ownership, schema=schema)
    rest_insert(url, key, "implementations", implementations, schema=schema)
    rest_insert(url, key, "implementation_milestones", milestones, schema=schema)
    rest_insert(url, key, "implementation_blockers", blockers, schema=schema)
    rest_insert(url, key, "implementation_tasks", impl_tasks, schema=schema)
    rest_insert(url, key, "customer_health", health, schema=schema)
    rest_insert(url, key, "health_history", health_hist, schema=schema)
    rest_insert(url, key, "win_loss_analysis", win_loss, schema=schema)
    print(f"Inserted {len(deals)} deals, {len(payments)} payments, {len(implementations)} implementations.")

    # ── tasks ──
    tasks = []
    task_pool = by_stage["lead"] + by_stage["contacted"] + by_stage["proposal"] + by_stage["active"]
    for c in task_pool:
        for _ in range(random.randint(0, 3)):
            due_off = random.randint(-5, 14)
            due = date.today() + timedelta(days=due_off)
            done = due_off < -1 and random.random() > 0.5
            ttype = random.choice(["demo", "proposal", "reminder", "call", "custom"])
            tasks.append({
                "id": uid(),
                "client_id": c["id"],
                "task_type": ttype,
                "title": {"demo": "Product demo", "proposal": "Send proposal", "reminder": "WhatsApp reminder", "call": "Follow-up call", "custom": "Collect documents"}[ttype],
                "note": f"For {c['company']}",
                "due_date": due.isoformat(),
                "due_time": random.choice([None, "10:30", "15:00", "11:00"]),
                "done": done,
                "done_at": iso(days_ago(abs(due_off))) if done else None,
                "created_at": iso(days_ago(random.randint(1, 30))),
            })
    # a few unassigned tasks
    for _ in range(8):
        tasks.append({
            "id": uid(),
            "client_id": None,
            "task_type": "custom",
            "title": random.choice(["Internal pipeline review", "Update playbook", "Prep AKRSP cohort deck"]),
            "note": None,
            "due_date": (date.today() + timedelta(days=random.randint(0, 7))).isoformat(),
            "due_time": "16:00",
            "done": False,
            "done_at": None,
        })
    rest_insert(url, key, "tasks", tasks, schema=schema)

    # ── final step shortlist ──
    final_step = [{"client_id": c["id"]} for c in (by_stage["proposal"] + by_stage["contacted"])[:12]]
    rest_insert(url, key, "final_step_clients", final_step, schema=schema)

    # ── pipeline snapshots (45 days) ──
    snapshots = []
    base = 18
    for i in range(45, -1, -1):
        d = date.today() - timedelta(days=i)
        contacted = max(5, base + random.randint(-4, 6))
        proposal = max(3, 10 + random.randint(-3, 5))
        wins = random.choice([0, 0, 0, 1, 1, 2])
        points = max(0, contacted * 1 + proposal * 7 - wins * 24)
        snapshots.append({
            "id": uid(),
            "snapshot_date": d.isoformat(),
            "contacted_count": contacted,
            "proposal_count": proposal,
            "points": points,
            "wins_today": wins,
            "win_points_removed": wins * 24,
        })
        base = contacted
    rest_insert(url, key, "pipeline_snapshots", snapshots, schema=schema)

    # ── sales process reference data ──
    rest_insert(url, key, "ideal_customer_profile", [{
        "id": uid(),
        "user_id": admin_id,
        "company_size_min": 20,
        "company_size_max": 200,
        "annual_revenue_min": 5000000,
        "annual_revenue_max": 50000000,
        "industry_vertical": "Solar EPC",
        "geography": ["Ahmedabad", "Surat", "Mumbai", "Pune"],
        "use_case_fit": "manual tracking of installation pipeline causing missed follow-ups",
        "budget_min": 50000,
        "budget_max": 500000,
        "decision_timeline_days": 30,
        "notes": "Best-fit segment based on mock 2026 win analysis.",
    }])

    rest_insert(url, key, "lead_scoring_rules", [
        {"id": uid(), "rule_name": "Has 20+ employees", "rule_criteria": {"field": "team_size", "operator": ">=", "value": 20}, "points_awarded": 25, "active": True, "order_sequence": 1},
        {"id": uid(), "rule_name": "Solar EPC business type", "rule_criteria": {"field": "business_type", "operator": "==", "value": "Solar EPC"}, "points_awarded": 30, "active": True, "order_sequence": 2},
        {"id": uid(), "rule_name": "In target territory", "rule_criteria": {"field": "territory", "operator": "in", "value": ["Ahmedabad", "Surat"]}, "points_awarded": 20, "active": True, "order_sequence": 3},
        {"id": uid(), "rule_name": "Revenue above 50L", "rule_criteria": {"field": "annual_revenue", "operator": ">=", "value": 5000000}, "points_awarded": 25, "active": True, "order_sequence": 4},
        {"id": uid(), "rule_name": "Hot temperature", "rule_criteria": {"field": "temperature", "operator": "==", "value": "hot"}, "points_awarded": 15, "active": True, "order_sequence": 5},
    ])

    rest_insert(url, key, "objection_playbook", [
        {"id": uid(), "objection_type": "price", "objection_statement": "It's too expensive compared to Excel.", "counter_strategy": "Show missed-SLA / lost-deal cost vs subscription.", "success_rate": 62},
        {"id": uid(), "objection_type": "competitor", "objection_statement": "We're already on Zoho / Bitrix.", "counter_strategy": "Case study: EPC that cut delays 30% after switching.", "success_rate": 48},
        {"id": uid(), "objection_type": "timing", "objection_statement": "Check back next quarter.", "counter_strategy": "Offer a 1-site pilot this month.", "success_rate": 55},
        {"id": uid(), "objection_type": "authority", "objection_statement": "Need partner / MD approval.", "counter_strategy": "Ask for a 20-min three-way call with economic buyer.", "success_rate": 51},
        {"id": uid(), "objection_type": "budget", "objection_statement": "No software budget this FY.", "counter_strategy": "Map to PM Surya Ghar ops budget or dealer co-op funds.", "success_rate": 44},
        {"id": uid(), "objection_type": "need", "objection_statement": "WhatsApp is enough for now.", "counter_strategy": "Audit last 30 days of missed follow-ups together.", "success_rate": 58},
    ])

    rest_insert(url, key, "sales_activity_targets", [
        {"id": uid(), "user_id": users[1]["id"], "period": "weekly", "target_cold_calls": 40, "target_followups": 20, "target_in_person_meetings": 3, "target_discoveries": 5, "target_proposals": 3, "target_closes": 1},
        {"id": uid(), "user_id": admin_id, "period": "monthly", "target_cold_calls": 120, "target_followups": 80, "target_in_person_meetings": 10, "target_discoveries": 16, "target_proposals": 10, "target_closes": 4},
    ])

    rest_insert(url, key, "forecast_log", [
        {"id": uid(), "user_id": admin_id, "period_month": "2026-06", "forecasted_revenue": 900000, "forecasted_wins": 3, "actual_revenue": 820000, "actual_wins": 3},
        {"id": uid(), "user_id": admin_id, "period_month": "2026-07", "forecasted_revenue": 1200000, "forecasted_wins": 4, "actual_revenue": 950000, "actual_wins": 3},
        {"id": uid(), "user_id": admin_id, "period_month": "2026-08", "forecasted_revenue": 1500000, "forecasted_wins": 5, "actual_revenue": 1320000, "actual_wins": 4},
        {"id": uid(), "user_id": admin_id, "period_month": "2026-09", "forecasted_revenue": 1600000, "forecasted_wins": 5, "actual_revenue": 0, "actual_wins": 0},
    ])

    # counts
    counts_sql = f"""
    select 'clients' as t, count(*)::int as c from {schema}.clients
    union all select 'contact_log', count(*)::int from {schema}.contact_log
    union all select 'deals', count(*)::int from {schema}.deals
    union all select 'payments', count(*)::int from {schema}.payments
    union all select 'tasks', count(*)::int from {schema}.tasks
    union all select 'implementations', count(*)::int from {schema}.implementations
    union all select 'pipeline_snapshots', count(*)::int from {schema}.pipeline_snapshots
    union all select 'users', count(*)::int from {schema}.users
    order by 1;
    """
    counts = pg_query(url, key, counts_sql)
    print("Seed complete:")
    for row in counts:
        print(f"  {row['t']}: {row['c']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.URLError as e:
        print(f"Network error talking to Supabase: {e}", file=sys.stderr)
        raise SystemExit(1)
