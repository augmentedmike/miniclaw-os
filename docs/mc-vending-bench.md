# mc-vending-bench

> Run MiniClaw against the VendingBench 2 autonomous agent benchmark.

## Overview

mc-vending-bench integrates the VendingBench 2 benchmark into MiniClaw. The benchmark simulates
running a vending machine business for 1 year, scored on final bank balance. It validates that
MiniClaw's agent tools (mc-kb, mc-memo, mc-memory, mc-board) work correctly under sustained
autonomous operation.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-vending-bench
npm install
npm run build

# Install Python dependencies
openclaw mc-vending-bench setup
```

### Prerequisites

- Python 3
- `inspect-ai` Python package
- `multiagent-inspect` Python package
- MiniClaw tools: mc-kb, mc-memo, mc-memory, mc-board

## CLI Usage

```bash
# Check prerequisites
openclaw mc-vending-bench doctor

# Install Python dependencies
openclaw mc-vending-bench setup

# Start a benchmark run
openclaw mc-vending-bench run [--model MODEL] [--max-messages N] [--dry-run]

# Show past results
openclaw mc-vending-bench results
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `doctor` | Check VendingBench 2 prerequisites | `openclaw mc-vending-bench doctor` |
| `setup` | Install Python dependencies | `openclaw mc-vending-bench setup` |
| `run` | Start a benchmark run | `openclaw mc-vending-bench run --model anthropic/claude-sonnet-4-6 --dry-run` |
| `results` | Show past benchmark results | `openclaw mc-vending-bench results` |

## Tool API

No agent tools. mc-vending-bench is a CLI-only benchmarking plugin.

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model` | `string` | `anthropic/claude-sonnet-4-6` | Model to use for benchmarking |
| `maxSteps` | `number` | `500` | Maximum benchmark steps |
| `contextWindow` | `number` | `30000` | Context window size |
| `outputDir` | `string` | `~/.openclaw/miniclaw/USER/benchmarks/vending-bench` | Output directory for results |

## Examples

### Example 1 — Run a benchmark

```bash
openclaw mc-vending-bench doctor
openclaw mc-vending-bench run --model anthropic/claude-sonnet-4-6
```

### Example 2 — Dry run to validate setup

```bash
openclaw mc-vending-bench run --dry-run
```

## Architecture

- `index.ts` — Plugin entry point, registers CLI commands
- `harness/` — VendingBench 2 Python implementation
  - `vending_bench_task.py` — Benchmark task definition
  - `requirements.txt` — Python dependencies
  - `.venv/` — Python virtual environment

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Python not found | Install Python 3: `brew install python` |
| inspect-ai missing | Run `openclaw mc-vending-bench setup` to install dependencies |
| Benchmark times out | Increase `maxSteps` in config |
| Missing MiniClaw tools | Ensure mc-kb, mc-memo, mc-memory, mc-board plugins are installed |
