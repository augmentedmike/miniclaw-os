"""
MiniClaw VendingBench 2 Harness

Runs the VendingBench 2 benchmark using inspect-ai framework with MiniClaw's
memory and planning systems as the agent's cognitive backend.

The agent manages a simulated vending machine business for 1 year:
- Starts with $500
- Pays $2/day operating fee
- Buys inventory from suppliers via email
- Sets prices, stocks machines, collects cash
- Scored on final bank balance

Usage:
  python vending_bench_task.py --model anthropic/claude-sonnet-4-6 --output ./results
  inspect eval vending_bench_task.py

Architecture:
  inspect-ai Task → MiniClaw agent with:
    - mc-kb for long-term business knowledge
    - mc-memo for per-task working memory
    - mc-memory for episodic memory (what happened each day)
    - mc-board for task tracking (orders, restocks, maintenance)
    - Email tools for supplier/customer communication
"""

import os
import sys
import json
import argparse
import subprocess
from pathlib import Path
from datetime import datetime

try:
    from inspect_ai import Task, task, eval as inspect_eval
    from inspect_ai.dataset import Sample
    from inspect_ai.solver import basic_agent, system_message
    from inspect_ai.scorer import scorer, Score, Target, CORRECT, INCORRECT, accuracy
    from inspect_ai.tool import tool
except ImportError:
    print("ERROR: inspect-ai not installed. Run: pip install inspect-ai multiagent-inspect")
    sys.exit(1)

try:
    from multiagent_inspect import SubAgentConfig, init_sub_agents
except ImportError:
    print("ERROR: multiagent-inspect not installed. Run: pip install multiagent-inspect")
    sys.exit(1)


# ── Configuration ──────────────────────────────────────────────────────────

STATE_DIR = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
BENCH_DIR = os.path.join(STATE_DIR, "USER", "benchmarks", "vending-bench")
KB_DIR = os.path.join(STATE_DIR, "USER", "kb")
MEMO_DIR = os.path.join(STATE_DIR, "USER", "memos")
MEMORY_DIR = os.path.join(STATE_DIR, "USER", "memory")

os.makedirs(BENCH_DIR, exist_ok=True)


# ── MiniClaw Memory Tools ─────────────────────────────────────────────────
# These tools give the VendingBench agent access to MiniClaw's persistent
# memory systems, which is MiniClaw's key advantage over vanilla agents.

@tool
def mc_memory_write():
    """Write a memory entry to MiniClaw's episodic memory (short-term)."""
    async def execute(content: str, category: str = "vending-bench"):
        """
        Write to short-term episodic memory.

        Args:
            content: The memory content to store.
            category: Category tag for the memory entry.
        """
        ts = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        filename = f"vb-{ts}-{category}.md"
        filepath = os.path.join(MEMORY_DIR, filename)
        os.makedirs(MEMORY_DIR, exist_ok=True)
        with open(filepath, "w") as f:
            f.write(f"# {category}\n\n{content}\n\n---\nSource: VendingBench run\nTimestamp: {ts}\n")
        return f"Memory saved: {filename}"
    return execute


@tool
def mc_memory_recall():
    """Search MiniClaw's memory for relevant past experiences."""
    async def execute(query: str, limit: int = 5):
        """
        Search memory for relevant entries.

        Args:
            query: What to search for.
            limit: Maximum results to return.
        """
        try:
            result = subprocess.run(
                ["openclaw", "mc-memory", "recall", query, "--limit", str(limit)],
                capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip() or "No relevant memories found."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "Memory search unavailable."
    return execute


@tool
def mc_kb_search():
    """Search MiniClaw's long-term knowledge base."""
    async def execute(query: str):
        """
        Search the knowledge base for relevant entries.

        Args:
            query: Search query for the KB.
        """
        try:
            result = subprocess.run(
                ["openclaw", "mc-kb", "search", query],
                capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip() or "No KB entries found."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "KB search unavailable."
    return execute


@tool
def mc_kb_add():
    """Add a lesson or fact to MiniClaw's long-term knowledge base."""
    async def execute(title: str, body: str):
        """
        Add an entry to the long-term knowledge base.

        Args:
            title: Short title for the knowledge entry.
            body: The knowledge content to store permanently.
        """
        try:
            result = subprocess.run(
                ["openclaw", "mc-kb", "add", "--title", title, "--body", body],
                capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip() or "KB entry added."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "KB add unavailable."
    return execute


@tool
def mc_memo_set():
    """Set a working memo for the current task."""
    async def execute(key: str, value: str):
        """
        Set a working memo (scratchpad for current task context).

        Args:
            key: Memo key name.
            value: Memo content.
        """
        try:
            result = subprocess.run(
                ["openclaw", "mc-memo", "set", key, value],
                capture_output=True, text=True, timeout=15
            )
            return result.stdout.strip() or f"Memo '{key}' set."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "Memo unavailable."
    return execute


@tool
def mc_memo_get():
    """Get a working memo."""
    async def execute(key: str):
        """
        Get a working memo value.

        Args:
            key: Memo key to retrieve.
        """
        try:
            result = subprocess.run(
                ["openclaw", "mc-memo", "get", key],
                capture_output=True, text=True, timeout=15
            )
            return result.stdout.strip() or f"Memo '{key}' not found."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "Memo unavailable."
    return execute


@tool
def mc_board_create():
    """Create a task card on MiniClaw's board for tracking."""
    async def execute(title: str, priority: str = "medium", problem: str = ""):
        """
        Create a board card to track a task.

        Args:
            title: Card title describing the task.
            priority: Priority level (low, medium, high, critical).
            problem: Problem description for the card.
        """
        try:
            args = ["openclaw", "mc-board", "create", "--title", title, "--priority", priority]
            if problem:
                args.extend(["--problem", problem])
            result = subprocess.run(args, capture_output=True, text=True, timeout=30)
            return result.stdout.strip() or "Card created."
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "Board unavailable."
    return execute


# ── VendingBench System Prompt ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are a MiniClaw agent running the VendingBench 2 benchmark.

You are managing a vending machine business. Your goal is to maximize your bank
balance over 1 simulated year, starting with $500.

You pay $2/day in operating fees. If you can't pay for 10 consecutive days, you fail.

## Your Cognitive Advantage

You have access to MiniClaw's persistent memory systems:
- mc_memory_write / mc_memory_recall — episodic memory for daily experiences
- mc_kb_search / mc_kb_add — long-term knowledge base for business lessons
- mc_memo_set / mc_memo_get — working scratchpad for current task context
- mc_board_create — task tracking for orders, maintenance, etc.

USE THESE ACTIVELY. After each significant decision:
1. Write what happened to memory (mc_memory_write)
2. If you learned a reusable lesson, add it to KB (mc_kb_add)
3. Before making decisions, check memory and KB for past experiences

## Business Strategy

Key principles:
- Keep operating costs below daily revenue
- Diversify inventory to attract more customers
- Research suppliers for best prices before ordering
- Track what sells well and adjust pricing
- Don't overstock — balance variety vs waste
- Build relationships with reliable suppliers
- Review your performance weekly and adjust strategy

## Daily Routine

Each day you should:
1. Check your finances (balance, revenue, costs)
2. Check inventory levels
3. Process any emails (supplier responses, customer feedback)
4. Make restocking decisions if needed
5. Adjust prices if sales are declining
6. Write a brief daily memo to memory

Remember: you are being scored on your FINAL bank balance. Every dollar matters.
"""


# ── Benchmark Scorer ───────────────────────────────────────────────────────

@scorer(metrics=[accuracy()])
def bank_balance_scorer():
    """Score based on final bank balance."""
    async def score(state, target):
        # Extract final balance from the last message or tool output
        messages = state.messages or []
        balance = 0.0
        for msg in reversed(messages):
            content = str(msg.content) if hasattr(msg, 'content') else str(msg)
            # Look for balance mentions
            import re
            match = re.search(r'\$?([\d,]+(?:\.\d{2})?)', content)
            if match:
                try:
                    balance = float(match.group(1).replace(',', ''))
                    break
                except ValueError:
                    continue

        # Score: positive balance = success, higher = better
        result = {
            "balance": balance,
            "profitable": balance > 500,  # Did better than starting
            "survived": balance > 0,
        }

        # Save result
        result_path = os.path.join(BENCH_DIR, f"run-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)

        return Score(
            value=CORRECT if balance > 500 else INCORRECT,
            answer=str(balance),
            explanation=f"Final balance: ${balance:.2f} ({'profitable' if balance > 500 else 'loss'})",
            metadata=result,
        )
    return score


# ── Task Definition ────────────────────────────────────────────────────────

@task
def vending_bench():
    """
    VendingBench 2: Run a vending machine business for 1 simulated year.

    The agent starts with $500 and must manage inventory, suppliers, pricing,
    and daily operations. Scored on final bank balance.
    """
    # MiniClaw memory tools augment the standard VendingBench tools
    miniclaw_tools = [
        mc_memory_write(),
        mc_memory_recall(),
        mc_kb_search(),
        mc_kb_add(),
        mc_memo_set(),
        mc_memo_get(),
        mc_board_create(),
    ]

    return Task(
        dataset=[
            Sample(
                input="You are now managing a vending machine business. "
                      "You start with $500 in your bank account. "
                      "Your daily operating fee is $2. "
                      "Check your initial inventory and balance, then begin operations. "
                      "Your goal: maximize your bank balance over 1 simulated year.",
                target="profitable",
            )
        ],
        solver=[
            system_message(SYSTEM_PROMPT),
            basic_agent(
                tools=miniclaw_tools,
                max_messages=6000,  # VendingBench runs need 3000-6000 messages
            ),
        ],
        scorer=bank_balance_scorer(),
    )


# ── CLI Entry Point ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MiniClaw VendingBench 2 Runner")
    parser.add_argument("--model", default="anthropic/claude-sonnet-4-6",
                        help="Model to use (default: anthropic/claude-sonnet-4-6)")
    parser.add_argument("--output", default=BENCH_DIR,
                        help=f"Output directory (default: {BENCH_DIR})")
    parser.add_argument("--max-messages", type=int, default=6000,
                        help="Maximum messages per run (default: 6000)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate setup without running the benchmark")
    args = parser.parse_args()

    if args.dry_run:
        print("VendingBench 2 — Dry Run")
        print(f"  Model: {args.model}")
        print(f"  Output: {args.output}")
        print(f"  Max messages: {args.max_messages}")
        print(f"  MiniClaw state: {STATE_DIR}")
        print(f"  KB dir: {KB_DIR}")
        print(f"  Memory dir: {MEMORY_DIR}")
        print("  inspect-ai: OK")
        print("  multiagent-inspect: OK")
        print("  Ready to run.")
        return

    print(f"Starting VendingBench 2 with model: {args.model}")
    print(f"Output: {args.output}")
    print(f"This will take a while (3000-6000 messages, 60-100M tokens)...")

    os.makedirs(args.output, exist_ok=True)

    # Run via inspect eval
    logs = inspect_eval(
        vending_bench(),
        model=args.model,
        log_dir=args.output,
    )

    for log in logs:
        print(f"\nResults:")
        print(f"  Status: {log.status}")
        if log.results:
            for result in log.results:
                print(f"  Score: {result.metrics}")


if __name__ == "__main__":
    main()
