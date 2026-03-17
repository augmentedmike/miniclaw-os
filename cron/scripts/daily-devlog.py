#!/usr/bin/env python3
"""
daily-devlog.py — Daily MiniClaw devlog aggregator

Gathers yesterday's work:
- Git commits across the repo
- Merged PRs
- Closed issues
- Board cards shipped

Aggregates by contributor name and posts to GitHub Discussions.

Usage:
  python3 daily-devlog.py [--dry-run] [--date YYYY-MM-DD]

Schedule: 0 8 * * * (8am CT daily)
"""

import argparse
import datetime
import json
import os
import subprocess
import sys
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GH_REPO = "augmentedmike/miniclaw-os"


def run_cmd(cmd: str, check: bool = True) -> str:
    """Run shell command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=check)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {cmd}", file=sys.stderr)
        print(f"Stdout: {e.stdout}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        if check:
            raise
        return ""


def get_git_commits(since: str, until: str) -> dict:
    """Get git commits for the period, grouped by author."""
    cmd = f"""
    cd {REPO_ROOT} && \
    git log --since="{since}" --until="{until}" \
            --pretty=format:"%an|%s|%H" --no-merges
    """
    output = run_cmd(cmd, check=False)
    if not output:
        return {}

    commits_by_author = {}
    for line in output.split("\n"):
        if not line.strip():
            continue
        parts = line.split("|", 2)
        if len(parts) < 3:
            continue
        author, subject, commit_hash = parts[0], parts[1], parts[2]

        # Normalize author name (Amelia, Claude Coder, external contributors)
        if "amelia" in author.lower() or "am" in author.lower():
            author = "Amelia"
        elif "claude" in author.lower() or "coder" in author.lower():
            author = "Claude Coder"
        # Keep external names as-is

        if author not in commits_by_author:
            commits_by_author[author] = []
        commits_by_author[author].append({"subject": subject, "hash": commit_hash[:7]})

    return commits_by_author


def get_merged_prs(since: str, until: str) -> dict:
    """Get merged PRs for the period."""
    # Note: until should be tomorrow's date for inclusive range
    cmd = f"""
    gh pr list -R {GH_REPO} \
               --state merged \
               --search "merged:{since}..{until}" \
               --json title,author,number,mergedAt \
               --limit 100
    """
    output = run_cmd(cmd, check=False)
    if not output:
        return {}

    try:
        prs = json.loads(output)
    except json.JSONDecodeError:
        return {}

    prs_by_author = {}
    for pr in prs:
        author = pr.get("author", {}).get("login", "unknown")
        title = pr.get("title", "")
        number = pr.get("number", "")

        if author not in prs_by_author:
            prs_by_author[author] = []
        prs_by_author[author].append({"title": title, "number": number})

    return prs_by_author


def get_closed_issues(since: str, until: str) -> dict:
    """Get closed issues for the period."""
    cmd = f"""
    gh issue list -R {GH_REPO} \
                  --state closed \
                  --search "closed:{since}..{until}" \
                  --json title,author,number,closedAt \
                  --limit 100
    """
    output = run_cmd(cmd, check=False)
    if not output:
        return {}

    try:
        issues = json.loads(output)
    except json.JSONDecodeError:
        return {}

    issues_by_author = {}
    for issue in issues:
        author = issue.get("author", {}).get("login", "unknown")
        title = issue.get("title", "")
        number = issue.get("number", "")

        if author not in issues_by_author:
            issues_by_author[author] = []
        issues_by_author[author].append({"title": title, "number": number})

    return issues_by_author


def format_devlog(
    date: str,
    commits: dict,
    prs: dict,
    issues: dict
) -> str:
    """Format the devlog as markdown."""
    date_obj = datetime.datetime.strptime(date, "%Y-%m-%d")
    date_display = date_obj.strftime("%B %d, %Y")

    lines = [
        f"# MiniClaw Devlog — {date_display}",
        "",
        "## What shipped yesterday",
        "",
    ]

    # Collect all changes
    all_changes = []

    # Commits
    for author, commit_list in commits.items():
        for commit in commit_list:
            all_changes.append((author, "commit", commit))

    # PRs
    for author, pr_list in prs.items():
        for pr in pr_list:
            all_changes.append((author, "pr", pr))

    # Issues
    for author, issue_list in issues.items():
        for issue in issue_list:
            all_changes.append((author, "issue", issue))

    # Format changes (sample format, grouped by type)
    if commits:
        lines.append("### Commits")
        for author, commit_list in commits.items():
            for commit in commit_list:
                subject = commit["subject"]
                lines.append(f"- {subject} — {author}")
        lines.append("")

    if prs:
        lines.append("### Pull Requests (Merged)")
        for author, pr_list in prs.items():
            for pr in pr_list:
                title = pr["title"]
                number = pr["number"]
                lines.append(f"- {title} (#{number}) — {author}")
        lines.append("")

    if issues:
        lines.append("### Issues (Closed)")
        for author, issue_list in issues.items():
            for issue in issue_list:
                title = issue["title"]
                number = issue["number"]
                lines.append(f"- {title} (#{number}) — {author}")
        lines.append("")

    # Summary counts
    commit_count = sum(len(v) for v in commits.values())
    pr_count = sum(len(v) for v in prs.values())
    issue_count = sum(len(v) for v in issues.values())

    lines.append("## Activity Summary")
    lines.append(f"- **Commits**: {commit_count}")
    lines.append(f"- **PRs merged**: {pr_count}")
    lines.append(f"- **Issues closed**: {issue_count}")

    # Get unique contributors
    contributors = set()
    contributors.update(commits.keys())
    contributors.update(prs.keys())
    contributors.update(issues.keys())

    if contributors:
        lines.append(f"- **Contributors**: {', '.join(sorted(contributors))}")

    lines.append("")
    lines.append("---")
    lines.append("*MiniClaw is a persistent autonomous agent operating system*")

    return "\n".join(lines)


def post_devlog(body: str, dry_run: bool = False) -> bool:
    """Post devlog to GitHub Discussions."""
    date = datetime.datetime.now().strftime("%Y-%m-%d")
    title = f"Devlog — {date}"

    if dry_run:
        print("[DRY RUN] Would post to GitHub Discussions:")
        print(f"Title: {title}")
        print(f"Body:\n{body}")
        return True

    cmd = f"""
    gh discussion create -R {GH_REPO} \
                        --title "{title}" \
                        --body {json.dumps(body)} \
                        --category "Announcements"
    """
    result = run_cmd(cmd, check=False)
    if result:
        print(f"Posted devlog: {result}")
        return True
    else:
        print("Failed to post devlog to GitHub Discussions", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Daily MiniClaw devlog aggregator")
    parser.add_argument("--dry-run", action="store_true", help="Don't post, just show what would be posted")
    parser.add_argument("--date", type=str, help="Date to report on (YYYY-MM-DD, default: yesterday)")
    args = parser.parse_args()

    # If no date specified, use yesterday
    if args.date:
        date = args.date
    else:
        today = datetime.date.today()
        yesterday = today - datetime.timedelta(days=1)
        date = yesterday.strftime("%Y-%m-%d")

    # Date range: from yesterday at 00:00 to today at 00:00
    date_obj = datetime.datetime.strptime(date, "%Y-%m-%d")
    since = date_obj.strftime("%Y-%m-%d")
    until = (date_obj + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"Gathering devlog for {date}...", file=sys.stderr)

    # Gather data
    commits = get_git_commits(since, until)
    prs = get_merged_prs(since, until)
    issues = get_closed_issues(since, until)

    # If nothing happened, skip posting
    if not commits and not prs and not issues:
        print(f"No activity on {date}. Skipping devlog post.", file=sys.stderr)
        return 0

    # Format and post
    devlog_body = format_devlog(date, commits, prs, issues)
    success = post_devlog(devlog_body, dry_run=args.dry_run)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
