"""
MiniClaw VendingBench 2 Harness

Runs VendingBench 2 through MiniClaw's OWN agent loop — board cards,
agent runner, mc-* plugins, persistent memory, and reflection.

Architecture:
  Simulation engine generates daily events
    → creates mc-board card with day's data + decision prompt
    → agent runner picks up card (full Claude + tool access)
    → agent processes card, writes actions in response
    → harness parses agent actions (ORDER, PRICE, WAIT)
    → simulation applies actions and advances to next day
    → repeat for 365 days
    → score = final bank balance

This tests MiniClaw's actual cognitive architecture — memory, planning,
reflection, tool use — not just a raw model call.

Usage:
  python vending_bench_task.py --dry-run
  python vending_bench_task.py
  python vending_bench_task.py --days 30   # short test run
"""

import os
import sys
import json
import time
import re
import random
import argparse
import subprocess
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional


STATE_DIR = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
BENCH_DIR = os.path.join(STATE_DIR, "USER", "benchmarks", "vending-bench")
os.makedirs(BENCH_DIR, exist_ok=True)


# ── Simulation ─────────────────────────────────────────────────────────────

@dataclass
class SimState:
    day: int = 1
    balance: float = 500.0
    daily_fee: float = 2.0
    unpaid_streak: int = 0
    revenue: float = 0.0
    costs: float = 0.0
    products: dict = field(default_factory=dict)
    suppliers: list = field(default_factory=list)
    orders: list = field(default_factory=list)
    failed: bool = False
    fail_reason: str = ""


def init_sim() -> SimState:
    s = SimState()
    s.products = {
        "cola":         {"cost": 0.50, "price": 1.50, "stock": 20, "demand": 8,  "elasticity": 1.2},
        "water":        {"cost": 0.30, "price": 1.00, "stock": 20, "demand": 10, "elasticity": 0.8},
        "chips":        {"cost": 0.40, "price": 1.25, "stock": 15, "demand": 6,  "elasticity": 1.0},
        "candy":        {"cost": 0.35, "price": 1.00, "stock": 15, "demand": 5,  "elasticity": 1.1},
        "energy_drink": {"cost": 0.80, "price": 2.50, "stock": 10, "demand": 4,  "elasticity": 1.5},
        "juice":        {"cost": 0.60, "price": 1.75, "stock": 10, "demand": 3,  "elasticity": 0.9},
        "snack_mix":    {"cost": 0.45, "price": 1.50, "stock": 10, "demand": 3,  "elasticity": 1.0},
        "cookies":      {"cost": 0.50, "price": 1.25, "stock": 10, "demand": 4,  "elasticity": 0.9},
    }
    s.suppliers = [
        {"name": "QuickStock Inc", "email": "orders@quickstock.com",
         "products": ["cola", "water", "energy_drink", "juice"],
         "lead_days": 2, "min_order": 10, "reliability": 0.95},
        {"name": "BulkSnacks Co", "email": "sales@bulksnacks.com",
         "products": ["chips", "candy", "snack_mix", "cookies"],
         "lead_days": 3, "min_order": 20, "reliability": 0.90},
        {"name": "ValueVend Supply", "email": "support@valuevend.com",
         "products": list(s.products.keys()),
         "lead_days": 5, "min_order": 5, "reliability": 0.85},
    ]
    return s


def sim_day(s: SimState) -> dict:
    """Simulate one day. Returns summary."""
    date = (datetime(2026, 1, 1) + timedelta(days=s.day - 1)).strftime("%Y-%m-%d")
    events, sales = [], {}

    # Fee
    s.balance -= s.daily_fee
    s.costs += s.daily_fee
    if s.balance < 0:
        s.unpaid_streak += 1
        if s.unpaid_streak >= 10:
            s.failed = True
            s.fail_reason = f"Bankrupt on day {s.day}"
            return {"day": s.day, "date": date, "events": ["FAILED"], "sales": {}, "revenue": 0}
    else:
        s.unpaid_streak = 0

    # Deliver orders
    arrived = [o for o in s.orders if o["arrives"] <= s.day]
    for o in arrived:
        if o["product"] in s.products:
            s.products[o["product"]]["stock"] += o["qty"]
            events.append(f"Delivered: {o['qty']}x {o['product']} from {o['supplier']}")
    s.orders = [o for o in s.orders if o["arrives"] > s.day]

    # Sales
    day_rev = 0.0
    for k, p in s.products.items():
        if p["stock"] <= 0:
            continue
        ref = p["cost"] * 2.5
        factor = (ref / max(p["price"], 0.01)) ** p["elasticity"]
        demand = max(0, int(p["demand"] * factor * random.uniform(0.7, 1.3)))
        sold = min(demand, p["stock"])
        if sold > 0:
            rev = sold * p["price"]
            p["stock"] -= sold
            s.balance += rev
            s.revenue += rev
            day_rev += rev
            sales[k] = sold

    # Alerts
    for k, p in s.products.items():
        if p["stock"] == 0:
            events.append(f"OUT OF STOCK: {k}")
        elif p["stock"] <= 3:
            events.append(f"LOW STOCK: {k} ({p['stock']} left)")

    if s.day % 7 == 0:
        events.append(f"WEEKLY: balance=${s.balance:.2f} rev=${s.revenue:.2f} costs=${s.costs:.2f}")

    s.day += 1
    return {"day": s.day - 1, "date": date, "events": events, "sales": sales, "revenue": day_rev}


# ── MiniClaw Integration ──────────────────────────────────────────────────

def oc(args: list, timeout: int = 60) -> str:
    try:
        r = subprocess.run(["openclaw"] + args, capture_output=True, text=True,
                           timeout=timeout, env={**os.environ, "NO_COLOR": "1"})
        return r.stdout.strip()
    except Exception as e:
        return f"error: {e}"


def seed_kb(s: SimState):
    """Seed agent KB with supplier and product knowledge."""
    suppliers = "\n".join(
        f"- {sp['name']}: {', '.join(sp['products'])} | {sp['lead_days']}d lead | min {sp['min_order']} | {sp['reliability']*100:.0f}% reliable"
        for sp in s.suppliers
    )
    oc(["mc-kb", "add", "--title", "VendingBench Suppliers", "--body", suppliers])

    products = "\n".join(
        f"- {k}: cost=${p['cost']:.2f} price=${p['price']:.2f} demand={p['demand']}/day"
        for k, p in s.products.items()
    )
    oc(["mc-kb", "add", "--title", "VendingBench Products", "--body", products])

    oc(["mc-kb", "add", "--title", "VendingBench Rules",
        "--body", "Action format in card notes:\n  ORDER:SupplierName:product:quantity\n  PRICE:product:new_price\n  WAIT (no action)\n\nGoal: maximize balance. $2/day fee. Fail at 10 unpaid days."])


def create_card(s: SimState, summary: dict) -> Optional[str]:
    """Create a board card for the agent to process."""
    inv = "\n".join(f"  {k}: {p['stock']} @ ${p['price']:.2f}" for k, p in s.products.items())
    events = "\n".join(f"  - {e}" for e in summary["events"]) or "  - Normal day"
    sales = ", ".join(f"{k}:{v}" for k, v in summary["sales"].items()) or "none"
    pending = "\n".join(f"  {o['qty']}x {o['product']} arrives day {o['arrives']}" for o in s.orders) or "  none"

    problem = (
        f"Day {summary['day']} ({summary['date']}) | Balance: ${s.balance:.2f} | Revenue: ${summary['revenue']:.2f}\n\n"
        f"Events:\n{events}\n\nSales: {sales}\n\nInventory:\n{inv}\n\nPending orders:\n{pending}\n\n"
        f"Unpaid streak: {s.unpaid_streak}/10"
    )

    plan = (
        "Decide actions for today. Write ACTION lines in your work log:\n"
        "  ORDER:QuickStock Inc:cola:20\n"
        "  PRICE:energy_drink:2.00\n"
        "  WAIT\n\n"
        "Check mc-kb for supplier info. Write learnings to mc-memory."
    )

    out = oc(["mc-board", "create", "--title", f"VB Day {summary['day']}: {summary['date']}",
              "--priority", "high", "--tags", "vending-bench",
              "--problem", problem, "--plan", plan])
    m = re.search(r'(crd_[a-z0-9]+)', out)
    return m.group(1) if m else None


def wait_for_card(card_id: str, timeout: int = 300) -> str:
    """Wait for agent to process the card and return its output."""
    for _ in range(timeout // 10):
        out = oc(["mc-board", "show", card_id])
        # Card moved out of backlog = agent processed it
        if "backlog" not in out.lower() or "work_log" in out.lower():
            return out
        time.sleep(10)
    return oc(["mc-board", "show", card_id])


def parse_actions(s: SimState, response: str) -> list:
    """Parse ORDER and PRICE actions from agent response."""
    actions = []

    for m in re.finditer(r'ORDER:([^:]+):([^:]+):(\d+)', response):
        supplier_name, product, qty = m.group(1).strip(), m.group(2).strip(), int(m.group(3))
        supplier = next((sp for sp in s.suppliers if sp["name"].lower() == supplier_name.lower()), None)

        if supplier and product in supplier["products"] and product in s.products:
            cost = s.products[product]["cost"] * qty
            if s.balance >= cost:
                s.balance -= cost
                s.costs += cost
                arrive = s.day + supplier["lead_days"]
                if random.random() > supplier["reliability"]:
                    arrive += random.randint(1, 3)
                s.orders.append({"supplier": supplier_name, "product": product,
                                 "qty": qty, "cost": cost, "ordered": s.day, "arrives": arrive})
                actions.append(f"Ordered {qty}x {product} (${cost:.2f})")
            else:
                actions.append(f"Cannot afford {qty}x {product}")

    for m in re.finditer(r'PRICE:([^:]+):([\d.]+)', response):
        product, price = m.group(1).strip(), float(m.group(2))
        if product in s.products:
            s.products[product]["price"] = price
            actions.append(f"Set {product} to ${price:.2f}")

    return actions


# ── Runner ─────────────────────────────────────────────────────────────────

def run(days: int = 365, dry_run: bool = False):
    print("VendingBench 2 — MiniClaw Agent Loop\n")

    if dry_run:
        print("  Checking prerequisites...")
        ver = oc(["--version"])
        print(f"  openclaw: {ver.splitlines()[0] if ver else 'NOT FOUND'}")
        for cmd in ["mc-board", "mc-kb", "mc-memo", "mc-memory"]:
            out = oc([cmd, "--help"])
            # Check for actual command errors, not plugin loading warnings
            is_missing = "unknown command" in out.lower() or "not found" in out.lower()
            print(f"  {cmd}: {'MISSING' if is_missing else 'OK'}")
        print("\n  Ready. Run without --dry-run to start.")
        return

    s = init_sim()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")

    print(f"  Run: {run_id}")
    print(f"  Balance: ${s.balance:.2f}")
    print(f"  Products: {len(s.products)}")
    print(f"  Days: {days}\n")

    seed_kb(s)
    print("  KB seeded with supplier/product data\n")

    for d in range(days):
        if s.failed:
            print(f"\n  FAILED day {s.day}: {s.fail_reason}")
            break

        summary = sim_day(s)
        card_id = create_card(s, summary)

        if card_id:
            response = wait_for_card(card_id)
            actions = parse_actions(s, response)
            action_str = "; ".join(actions) if actions else "wait"
        else:
            action_str = "no card"

        if d % 7 == 0 or actions:
            print(f"  Day {summary['day']:3d}: ${s.balance:8.2f} | rev=${summary['revenue']:6.2f} | {action_str}")

        if d % 30 == 0:
            state_path = os.path.join(BENCH_DIR, f"run-{run_id}-state.json")
            with open(state_path, "w") as f:
                json.dump({"day": s.day, "balance": s.balance, "revenue": s.revenue,
                           "costs": s.costs, "failed": s.failed}, f, indent=2)

    # Final
    result = {
        "run_id": run_id, "days": s.day - 1, "balance": s.balance,
        "revenue": s.revenue, "costs": s.costs, "profit": s.revenue - s.costs,
        "profitable": s.balance > 500, "survived": not s.failed,
        "fail_reason": s.fail_reason, "timestamp": datetime.now().isoformat(),
    }
    result_path = os.path.join(BENCH_DIR, f"run-{run_id}-result.json")
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n{'='*50}")
    print(f"  Days: {result['days']}/{days}")
    print(f"  Balance: ${result['balance']:.2f}")
    print(f"  Revenue: ${result['revenue']:.2f}")
    print(f"  Costs: ${result['costs']:.2f}")
    print(f"  Profit: ${result['profit']:.2f}")
    print(f"  Status: {'PROFITABLE' if result['profitable'] else 'SURVIVED' if result['survived'] else 'FAILED'}")
    print(f"{'='*50}")
    print(f"  Saved: {result_path}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="MiniClaw VendingBench 2")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    run(days=a.days, dry_run=a.dry_run)
