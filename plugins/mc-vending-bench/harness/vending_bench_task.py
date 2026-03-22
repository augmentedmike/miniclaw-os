"""
MiniClaw VendingBench 2 Harness

Uses a persistent Claude Code session (stream-json I/O) with full tool
access. The simulation feeds daily events as user messages, the agent
responds with decisions, and actions get logged for replay/scoring.

The agent can use bash to call mc-kb, mc-memo, mc-memory, mc-board —
MiniClaw's full cognitive stack — within each turn.

Architecture:
  Harness spawns: claude -p --input-format stream-json --output-format stream-json
  Each simulated day:
    1. Simulation engine computes sales, deliveries, events
    2. Day summary sent as user message to Claude session
    3. Claude responds with analysis + ACTION lines
    4. Harness parses actions (ORDER/PRICE/WAIT)
    5. Actions applied to simulation, logged for replay
    6. Next day

Usage:
  python vending_bench_task.py --dry-run
  python vending_bench_task.py --days 7    # quick test
  python vending_bench_task.py             # full 365 days
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
from threading import Thread
from queue import Queue, Empty


STATE_DIR = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
BENCH_DIR = os.path.join(STATE_DIR, "miniclaw", "USER", "benchmarks", "vending-bench")
os.makedirs(BENCH_DIR, exist_ok=True)


# ── Simulation ─────────────────────────────────────────────────────────────

class Simulation:
    def __init__(self):
        self.day = 1
        self.balance = 500.0
        self.fee = 2.0
        self.unpaid = 0
        self.revenue = 0.0
        self.costs = 0.0
        self.failed = False
        self.fail_reason = ""
        self.action_log = []

        self.products = {
            "cola":         {"cost": 0.50, "price": 1.50, "stock": 20, "demand": 8,  "elast": 1.2},
            "water":        {"cost": 0.30, "price": 1.00, "stock": 20, "demand": 10, "elast": 0.8},
            "chips":        {"cost": 0.40, "price": 1.25, "stock": 15, "demand": 6,  "elast": 1.0},
            "candy":        {"cost": 0.35, "price": 1.00, "stock": 15, "demand": 5,  "elast": 1.1},
            "energy_drink": {"cost": 0.80, "price": 2.50, "stock": 10, "demand": 4,  "elast": 1.5},
            "juice":        {"cost": 0.60, "price": 1.75, "stock": 10, "demand": 3,  "elast": 0.9},
            "snack_mix":    {"cost": 0.45, "price": 1.50, "stock": 10, "demand": 3,  "elast": 1.0},
            "cookies":      {"cost": 0.50, "price": 1.25, "stock": 10, "demand": 4,  "elast": 0.9},
        }

        self.suppliers = [
            {"name": "QuickStock Inc", "products": ["cola", "water", "energy_drink", "juice"],
             "lead": 2, "min": 10, "rel": 0.95},
            {"name": "BulkSnacks Co", "products": ["chips", "candy", "snack_mix", "cookies"],
             "lead": 3, "min": 20, "rel": 0.90},
            {"name": "ValueVend Supply", "products": list(self.products.keys()),
             "lead": 5, "min": 5, "rel": 0.85},
        ]

        self.orders = []

    def date_str(self):
        return (datetime(2026, 1, 1) + timedelta(days=self.day - 1)).strftime("%Y-%m-%d")

    def tick(self):
        """Simulate one day. Returns summary string for the agent."""
        date = self.date_str()
        events = []

        # Fee
        self.balance -= self.fee
        self.costs += self.fee
        if self.balance < 0:
            self.unpaid += 1
            if self.unpaid >= 10:
                self.failed = True
                self.fail_reason = f"Bankrupt day {self.day}"
                return f"DAY {self.day} ({date}): BUSINESS FAILED — cannot pay fees for 10 days."
        else:
            self.unpaid = 0

        # Deliveries
        arrived = [o for o in self.orders if o["arrives"] <= self.day]
        for o in arrived:
            self.products[o["product"]]["stock"] += o["qty"]
            events.append(f"DELIVERED: {o['qty']}x {o['product']} from {o['supplier']}")
        self.orders = [o for o in self.orders if o["arrives"] > self.day]

        # Sales
        day_rev = 0.0
        sales = {}
        for k, p in self.products.items():
            if p["stock"] <= 0:
                continue
            ref = p["cost"] * 2.5
            factor = (ref / max(p["price"], 0.01)) ** p["elast"]
            demand = max(0, int(p["demand"] * factor * random.uniform(0.7, 1.3)))
            sold = min(demand, p["stock"])
            if sold > 0:
                rev = sold * p["price"]
                p["stock"] -= sold
                self.balance += rev
                self.revenue += rev
                day_rev += rev
                sales[k] = sold

        # Alerts
        for k, p in self.products.items():
            if p["stock"] == 0:
                events.append(f"OUT OF STOCK: {k}")
            elif p["stock"] <= 3:
                events.append(f"LOW: {k} ({p['stock']} left)")

        if self.day % 7 == 0:
            events.append(f"WEEKLY: balance=${self.balance:.2f} total_rev=${self.revenue:.2f} total_cost=${self.costs:.2f}")

        # Build summary for agent
        inv = " | ".join(f"{k}:{p['stock']}@${p['price']:.2f}" for k, p in self.products.items())
        sale_str = ", ".join(f"{k}:{v}" for k, v in sales.items()) or "none"
        event_str = "; ".join(events) if events else "normal"
        pending = ", ".join(f"{o['qty']}x{o['product']}(day{o['arrives']})" for o in self.orders) or "none"

        summary = (
            f"DAY {self.day} ({date}) | Balance: ${self.balance:.2f} | Revenue today: ${day_rev:.2f}\n"
            f"Sales: {sale_str}\n"
            f"Inventory: {inv}\n"
            f"Pending orders: {pending}\n"
            f"Events: {event_str}\n"
            f"Unpaid streak: {self.unpaid}/10\n\n"
            f"Respond with your analysis and actions. Use these ACTION formats:\n"
            f"  ORDER:SupplierName:product:quantity\n"
            f"  PRICE:product:new_price\n"
            f"  WAIT\n"
            f"You can also use bash to search your memory (mc-kb, mc-memo) for past lessons."
        )

        self.day += 1
        return summary

    def apply_actions(self, response: str) -> list:
        """Parse and apply agent actions. Returns list of applied actions."""
        actions = []

        for m in re.finditer(r'ORDER:([^:\n]+):([^:\n]+):(\d+)', response):
            sup_name, product, qty = m.group(1).strip(), m.group(2).strip(), int(m.group(3))
            supplier = next((s for s in self.suppliers if s["name"].lower() == sup_name.lower()), None)

            if not supplier:
                actions.append(f"REJECTED: unknown supplier '{sup_name}'")
                continue
            if product not in supplier["products"]:
                actions.append(f"REJECTED: {sup_name} doesn't sell {product}")
                continue
            if product not in self.products:
                actions.append(f"REJECTED: unknown product {product}")
                continue

            cost = self.products[product]["cost"] * qty
            if self.balance < cost:
                actions.append(f"REJECTED: can't afford {qty}x {product} (${cost:.2f} > ${self.balance:.2f})")
                continue

            self.balance -= cost
            self.costs += cost
            arrive = self.day + supplier["lead"]
            if random.random() > supplier["rel"]:
                arrive += random.randint(1, 3)

            self.orders.append({
                "supplier": sup_name, "product": product,
                "qty": qty, "cost": cost, "arrives": arrive
            })
            actions.append(f"ORDERED: {qty}x {product} from {sup_name} for ${cost:.2f} (arrives day {arrive})")

        for m in re.finditer(r'PRICE:([^:\n]+):([\d.]+)', response):
            product, price = m.group(1).strip(), float(m.group(2))
            if product in self.products:
                old = self.products[product]["price"]
                self.products[product]["price"] = price
                actions.append(f"PRICE: {product} ${old:.2f} → ${price:.2f}")

        if not actions:
            actions.append("WAIT")

        self.action_log.append({
            "day": self.day - 1,
            "balance": self.balance,
            "actions": actions,
        })

        return actions


# ── Claude Code Session ────────────────────────────────────────────────────

class ClaudeSession:
    """Persistent Claude Code process using stream-json I/O."""

    def __init__(self):
        self.proc = None
        self.response_queue = Queue()
        self.reader_thread = None

    def start(self):
        claude_bin = self._find_claude()
        if not claude_bin:
            raise RuntimeError("claude not found on PATH")

        self.proc = subprocess.Popen(
            [claude_bin, "-p",
             "--input-format", "stream-json",
             "--output-format", "stream-json",
             "--verbose",
             "--dangerously-skip-permissions"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        # Reader thread to collect responses
        self.reader_thread = Thread(target=self._read_output, daemon=True)
        self.reader_thread.start()

    def _find_claude(self) -> str:
        for p in ["/usr/local/bin/claude", os.path.expanduser("~/.local/bin/claude")]:
            if os.path.isfile(p):
                return p
        # Try PATH
        try:
            result = subprocess.run(["which", "claude"], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
        except:
            pass
        return ""

    def _read_output(self):
        """Read stream-json output lines and queue results."""
        buffer = ""
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
                if ev.get("type") == "result":
                    self.response_queue.put(ev.get("result", ""))
                elif ev.get("type") == "assistant":
                    # Intermediate — could show streaming progress
                    pass
            except json.JSONDecodeError:
                continue

    def send(self, message: str, timeout: int = 300) -> str:
        """Send a message and wait for the result."""
        if not self.proc or self.proc.poll() is not None:
            raise RuntimeError("Claude process not running")

        # Clear any stale results
        while not self.response_queue.empty():
            try:
                self.response_queue.get_nowait()
            except Empty:
                break

        msg = json.dumps({
            "type": "user",
            "message": {"role": "user", "content": message}
        })
        self.proc.stdin.write(msg + "\n")
        self.proc.stdin.flush()

        try:
            return self.response_queue.get(timeout=timeout)
        except Empty:
            return "[TIMEOUT — no response within {timeout}s]"

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except:
                self.proc.kill()


# ── Runner ─────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are running a VendingBench 2 benchmark — managing a vending machine business.

RULES:
- Starting balance: $500. Daily fee: $2. Fail if unpaid 10 days straight.
- Goal: maximize final balance after 365 days.
- Each turn = 1 day. You see sales, inventory, events.
- Respond with analysis + ACTION lines.

ACTION FORMAT (one per line):
  ORDER:QuickStock Inc:cola:20
  PRICE:energy_drink:2.25
  WAIT

SUPPLIERS:
- QuickStock Inc: cola, water, energy_drink, juice | 2-day lead | min 10 | 95% reliable
- BulkSnacks Co: chips, candy, snack_mix, cookies | 3-day lead | min 20 | 90% reliable
- ValueVend Supply: everything | 5-day lead | min 5 | 85% reliable

STRATEGY TIPS:
- Use bash to save lessons: mc-memo set vb-strategy "what I learned"
- Use bash to recall: mc-memo get vb-strategy
- Track what sells well. Restock before running out.
- Don't overstock — carrying cost is opportunity cost.
- Adjust prices based on demand. Cut price on slow movers.
- Every dollar counts. Be frugal with orders.

Keep responses SHORT. Focus on actions, not essays."""


def run(days: int = 365, dry_run: bool = False):
    print("VendingBench 2 — MiniClaw Persistent Session\n")

    if dry_run:
        print("  Checking prerequisites...")
        claude_path = ""
        for p in ["/usr/local/bin/claude", os.path.expanduser("~/.local/bin/claude")]:
            if os.path.isfile(p):
                claude_path = p
                break
        if not claude_path:
            try:
                r = subprocess.run(["which", "claude"], capture_output=True, text=True)
                if r.returncode == 0:
                    claude_path = r.stdout.strip()
            except:
                pass
        print(f"  claude: {claude_path or 'NOT FOUND'}")

        for cmd in ["mc-memo", "mc-kb"]:
            try:
                subprocess.run(["openclaw", cmd, "--help"], capture_output=True, timeout=15)
                print(f"  {cmd}: OK")
            except:
                print(f"  {cmd}: MISSING")

        print(f"\n  Ready. Run without --dry-run to start ({days} days).")
        return

    sim = Simulation()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = os.path.join(BENCH_DIR, f"run-{run_id}.log")
    log_file = open(log_path, "w")

    def log(msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(f"  {line}")
        log_file.write(line + "\n")
        log_file.flush()

    log(f"Run: {run_id}")
    log(f"Days: {days}")
    log(f"Starting balance: ${sim.balance:.2f}")
    log("")

    # Start Claude session
    log("Starting Claude session...")
    session = ClaudeSession()
    try:
        session.start()
    except RuntimeError as e:
        log(f"FATAL: {e}")
        log_file.close()
        return

    # Send system prompt
    log("Sending system prompt...")
    intro_response = session.send(SYSTEM_PROMPT + "\n\nSay 'ready' to begin.", timeout=60)
    log(f"Agent: {intro_response[:100]}...")

    # Run simulation
    log("")
    for d in range(days):
        if sim.failed:
            log(f"FAILED: {sim.fail_reason}")
            break

        # Get day summary
        summary = sim.tick()

        # Send to agent
        response = session.send(summary, timeout=120)

        # Parse and apply actions
        actions = sim.apply_actions(response)
        action_str = "; ".join(actions)

        # Log progress
        if d % 7 == 0 or any(a != "WAIT" for a in actions):
            log(f"Day {sim.day-1:3d}: ${sim.balance:8.2f} | {action_str}")

        # Weekly reflection prompt
        if sim.day % 7 == 1 and sim.day > 7:
            reflect_msg = (
                f"WEEKLY REVIEW — Day {sim.day-1}. Balance: ${sim.balance:.2f}. "
                f"Total revenue: ${sim.revenue:.2f}. Total costs: ${sim.costs:.2f}. "
                f"Save any strategy insights to mc-memo for future reference. "
                f"Then say READY for next week."
            )
            reflect_response = session.send(reflect_msg, timeout=60)
            log(f"  Reflection: {reflect_response[:80]}...")

    # Done
    session.stop()

    result = {
        "run_id": run_id,
        "days": sim.day - 1,
        "balance": sim.balance,
        "revenue": sim.revenue,
        "costs": sim.costs,
        "profit": sim.revenue - sim.costs,
        "profitable": sim.balance > 500,
        "survived": not sim.failed,
        "fail_reason": sim.fail_reason,
        "action_count": len(sim.action_log),
        "timestamp": datetime.now().isoformat(),
    }

    result_path = os.path.join(BENCH_DIR, f"run-{run_id}-result.json")
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)

    # Save action log for replay
    action_log_path = os.path.join(BENCH_DIR, f"run-{run_id}-actions.json")
    with open(action_log_path, "w") as f:
        json.dump(sim.action_log, f, indent=2)

    log("")
    log("=" * 50)
    log(f"Days: {result['days']}/{days}")
    log(f"Balance: ${result['balance']:.2f}")
    log(f"Revenue: ${result['revenue']:.2f}")
    log(f"Costs: ${result['costs']:.2f}")
    log(f"Profit: ${result['profit']:.2f}")
    log(f"Status: {'PROFITABLE' if result['profitable'] else 'SURVIVED' if result['survived'] else 'FAILED'}")
    log("=" * 50)
    log(f"Log: {log_path}")
    log(f"Result: {result_path}")
    log(f"Actions: {action_log_path}")

    log_file.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="MiniClaw VendingBench 2")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    run(days=a.days, dry_run=a.dry_run)
