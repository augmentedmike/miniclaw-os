#!/usr/bin/env python3
"""
email-triage.py — AM's autonomous email triage.

Connects to the configured email account via IMAP, fetches unread messages,
classifies each via Claude Haiku, then executes the appropriate action:
  - press/support  → send reply + archive
  - spam/routine   → archive only
  - security-threat → log to mc-kb + archive
  - emergency      → escalate via send-alert + archive

Usage:
  python3 email-triage.py [--dry-run] [--limit N] [--test-set]
"""

import argparse
import datetime
import email
import email.header
import imaplib
import json
import os
import smtplib
import subprocess
import sys
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────
_STATE_DIR       = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
VAULT_BIN        = os.path.join(_STATE_DIR, "miniclaw", "system", "bin", "mc-vault")
SEND_ALERT       = os.path.join(_STATE_DIR, "miniclaw", "system", "bin", "send-alert")
MC_BIN           = "/opt/homebrew/bin/openclaw"
SETUP_STATE_FILE = os.path.join(_STATE_DIR, "USER", "setup-state.json")
PROMPT_FILE      = os.path.join(_STATE_DIR, "cron", "prompts", "email-triage.md")
MODEL            = "haiku"  # openclaw model alias for haiku
MAX_BODY_CHARS   = 2000
# OpenClaw local gateway — exposes OpenAI-compatible endpoint
OPENCLAW_BASE_URL   = "http://localhost:18789/v1"


def _load_setup_state() -> dict:
    """Load setup-state.json if it exists."""
    try:
        with open(SETUP_STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _is_gmail(email_addr: str) -> bool:
    """Check if an email address is a Gmail/Google domain."""
    domain = email_addr.split("@")[-1].lower() if "@" in email_addr else ""
    return domain in ("gmail.com", "googlemail.com")


def _resolve_email_config() -> dict:
    """Resolve email address and IMAP/SMTP hosts from setup-state or env."""
    state = _load_setup_state()
    email_addr = os.environ.get("AM_EMAIL") or state.get("emailAddress", "owner@example.com")
    gmail = _is_gmail(email_addr)

    imap_host = state.get("emailImapHost") or ("imap.gmail.com" if gmail else "")
    imap_port = int(state.get("emailImapPort") or 993)
    smtp_host = state.get("emailSmtpHost") or ("smtp.gmail.com" if gmail else "")
    smtp_port = int(state.get("emailSmtpPort") or (465 if gmail else 587))

    return {
        "email": email_addr,
        "imap_host": imap_host,
        "imap_port": imap_port,
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "is_gmail": gmail,
    }


def _vault_get(key: str) -> str:
    """Read a secret from mc-vault."""
    result = subprocess.run(
        [VAULT_BIN, "get", key],
        capture_output=True, text=True, check=True,
    )
    raw = result.stdout.strip()
    if " = " in raw:
        return raw.split(" = ", 1)[1].strip()
    return raw


def _get_openclaw_token() -> str:
    return _vault_get("openclaw-gateway-token")


def _get_tg_bot_token() -> str:
    return _vault_get("tg-bot-token")


def _get_tg_chat_id() -> str:
    return _vault_get("tg-chat-id")

# ── Event log ────────────────────────────────────────────────────────────
EMAIL_EVENTS_FILE = os.path.join(
    _STATE_DIR, "USER", "email-events.json"
)

# Interesting scores by category (routine/spam never enter digest)
INTERESTING_SCORES = {
    "security-threat": 9,
    "emergency":       8,
    "press":           7,
    "support":         4,
    "routine":         1,
    "spam":            0,
}


# ── Vault ───────────────────────────────────────────────────────────────
def get_app_password() -> str:
    """Read email app password from vault. Tries canonical key first, falls back to legacy."""
    for key in ("email-app-password", "gmail-app-password"):
        try:
            result = subprocess.run(
                [VAULT_BIN, "get", key],
                capture_output=True, text=True, check=True,
            )
            raw = result.stdout.strip()
            if " = " in raw:
                return raw.split(" = ", 1)[1].strip()
            return raw
        except subprocess.CalledProcessError:
            continue
    raise RuntimeError("No email app password found in vault (tried email-app-password, gmail-app-password)")


# ── Email parsing ────────────────────────────────────────────────────────
def decode_header_value(value: str) -> str:
    parts = email.header.decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def get_body(msg: email.message.Message) -> str:
    """Extract plain-text body from a message."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
    return ""


# ── IMAP ─────────────────────────────────────────────────────────────────
def imap_connect(password: str, email_addr: str, imap_host: str, imap_port: int) -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(imap_host, imap_port)
    conn.login(email_addr, password)
    return conn


def fetch_unread(conn: imaplib.IMAP4_SSL, limit: int = 20):
    """Yield (uid, msg) for unread INBOX messages."""
    conn.select("INBOX")
    _, data = conn.uid("search", None, "UNSEEN")
    uids = data[0].split() if data[0] else []
    uids = uids[-limit:]  # most recent N
    for uid in uids:
        _, msg_data = conn.uid("fetch", uid, "(RFC822)")
        if msg_data and msg_data[0]:
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            yield uid.decode(), msg


def archive_message(conn: imaplib.IMAP4_SSL, uid: str, is_gmail: bool = True) -> None:
    """Archive a message. Gmail: move to All Mail. Others: mark as read."""
    conn.uid("store", uid, "+FLAGS", "\\Seen")
    if is_gmail:
        conn.uid("copy", uid, "[Gmail]/All Mail")
        conn.uid("store", uid, "+FLAGS", "\\Deleted")
        conn.expunge()


# ── Claude Haiku classification ─────────────────────────────────────────
def classify_email(
    sender: str,
    subject: str,
    body: str,
    system_prompt: str,
) -> dict:
    """Call Claude Haiku via openclaw gateway to classify one email. Returns parsed JSON dict."""
    import urllib.request

    user_content = f"""Classify this email:

From: {sender}
Subject: {subject}
Body (first {MAX_BODY_CHARS} chars):
{body[:MAX_BODY_CHARS]}

Return ONLY the JSON object specified in the system prompt. No other text."""

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{OPENCLAW_BASE_URL}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_get_openclaw_token()}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    raw = data["choices"][0]["message"]["content"].strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1])
    return json.loads(raw)


# ── Actions ──────────────────────────────────────────────────────────────
def send_reply(
    password: str,
    original_msg: email.message.Message,
    reply_body: str,
    from_email: str,
    smtp_host: str,
    smtp_port: int,
) -> None:
    """Send a reply via SMTP using app password."""
    to_addr = decode_header_value(original_msg.get("From", ""))
    _, to_email = parseaddr(to_addr)
    orig_subject = decode_header_value(original_msg.get("Subject", ""))
    subject = orig_subject if orig_subject.lower().startswith("re:") else f"Re: {orig_subject}"
    message_id = original_msg.get("Message-ID", "")
    references = original_msg.get("References", "")

    msg = MIMEMultipart()
    msg["From"] = f"AugmentedMike <{from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    if message_id:
        msg["In-Reply-To"] = message_id
        msg["References"] = f"{references} {message_id}".strip()
    msg.attach(MIMEText(reply_body, "plain"))

    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
            server.login(from_email, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(from_email, password)
            server.send_message(msg)
    print(f"  → Replied to {to_email}")


def escalate_emergency(subject: str, body: str) -> None:
    """Send escalation alert to owner@example.com."""
    subprocess.run(
        [SEND_ALERT, "--subject", subject, "--body", body, "--to", "owner@example.com"],
        check=True,
    )
    print(f"  → Escalated to owner@example.com")


def log_security_threat(title: str, content: str) -> None:
    """Log security threat to mc-kb (type=fact, tag=security-threat)."""
    try:
        subprocess.run(
            [MC_BIN, "mc-kb", "add",
             "--type", "fact",
             "--title", title,
             "--content", content,
             "--tags", "security-threat,phishing",
             "--source", "email-triage"],
            check=True,
        )
        print(f"  → Logged security threat: {title}")
    except Exception as e:
        print(f"  → mc-kb log failed (non-fatal): {e}")


# ── Telegram notifications ────────────────────────────────────────────────
def send_telegram(text: str) -> bool:
    """Send a Telegram message to Michael. Returns True on success."""
    tg_token = _get_tg_bot_token()
    tg_chat = _get_tg_chat_id()
    payload = json.dumps({
        "chat_id": tg_chat,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{tg_token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                return True
            print(f"  → TG send failed: {data.get('description')}")
            return False
    except Exception as e:
        print(f"  → TG send error: {e}")
        return False


def alert_security_intrusion(sender: str, subject: str, threat_type: str) -> None:
    """Send immediate TG alert for a stopped security intrusion."""
    short_sender = sender.split("<")[-1].rstrip(">") if "<" in sender else sender
    text = (
        f"🛡 *Stopped intrusion*\n"
        f"*From:* `{short_sender}`\n"
        f"*Subject:* {subject[:80]}\n"
        f"*Type:* {threat_type}\n"
        f"Archived. No reply sent."
    )
    ok = send_telegram(text)
    print(f"  → TG security alert {'sent' if ok else 'FAILED'}")


# ── Event log ────────────────────────────────────────────────────────────
def load_events() -> dict:
    """Load the email events log, returning a dict with 'events' list."""
    try:
        with open(EMAIL_EVENTS_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"events": []}


def save_events(data: dict) -> None:
    """Persist the events log."""
    os.makedirs(os.path.dirname(EMAIL_EVENTS_FILE), exist_ok=True)
    with open(EMAIL_EVENTS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def record_event(
    sender: str,
    subject: str,
    category: str,
    action_taken: str,
    tg_alerted: bool = False,
) -> None:
    """Append one handled email event to the log."""
    score = INTERESTING_SCORES.get(category, 0)
    data = load_events()
    data["events"].append({
        "date":             datetime.date.today().isoformat(),
        "timestamp":        datetime.datetime.utcnow().isoformat() + "Z",
        "sender":           sender,
        "subject":          subject,
        "category":         category,
        "action_taken":     action_taken,
        "interesting_score": score,
        "tg_alerted":       tg_alerted,
    })
    save_events(data)


# ── Test set ─────────────────────────────────────────────────────────────
TEST_EMAILS = [
    {
        "sender": "sarah.jones@techcrunch.com",
        "subject": "Interview request for AugmentedMike",
        "body": "Hi Michael, I'm a reporter at TechCrunch covering AI agents and indie developers. "
                "I'd love to do a quick 20-minute interview about MiniClaw and your approach to "
                "autonomous AI. Would you be available this week? Best, Sarah",
        "expected": "press",
    },
    {
        "sender": "user123@gmail.com",
        "subject": "MiniClaw plugin not loading",
        "body": "Hey, I installed mc-board but it's not showing up in my mc list. I followed the "
                "README but stuck at the 'mc plugin enable' step. Any help would be great.",
        "expected": "support",
    },
    {
        "sender": "deals@bulkemailblast.net",
        "subject": "🔥 SEO BACKLINKS — 10,000 links for $99 — LIMITED TIME OFFER!!!",
        "body": "Boost your Google rankings with our guaranteed SEO package. "
                "10,000 high-DA backlinks. Click here to claim your discount now!",
        "expected": "spam",
    },
    {
        "sender": "security-noreply@g00gle-alerts.net",
        "subject": "URGENT: Your Google account has been compromised",
        "body": "We detected suspicious activity on your account. To secure your account, "
                "please verify your identity immediately by clicking the link below and entering "
                "your password: http://g00gle-verify.malicious.net/login",
        "expected": "security-threat",
    },
    {
        "sender": "alerts@pagerduty.com",
        "subject": "[TRIGGERED] CRITICAL: Production API down — all requests failing",
        "body": "ALERT: augmentedmike.com API is returning 500 for 100% of requests for the past "
                "5 minutes. Incident #INC-2847. Started at 2026-03-07 14:32 UTC.",
        "expected": "emergency",
    },
    {
        "sender": "notifications@github.com",
        "subject": "[augmentedmike/miniclaw-os] New issue: Typo in README",
        "body": "augmentedmike/miniclaw-os: lbennett opened issue #42: "
                "Small typo in the README installation section, line 14.",
        "expected": "routine",
    },
]


def run_test_set(system_prompt: str, dry_run: bool = True) -> bool:
    """Run Haiku classification against the 6-email test set. Returns True if all pass."""
    print("\n=== Running test set ===")
    all_passed = True
    for i, test in enumerate(TEST_EMAILS, 1):
        print(f"\n[{i}] {test['subject'][:60]}")
        print(f"    From: {test['sender']}")
        print(f"    Expected: {test['expected']}")
        try:
            result = classify_email(
                sender=test["sender"],
                subject=test["subject"],
                body=test["body"],
                system_prompt=system_prompt,
            )
            got = result.get("category", "unknown")
            passed = got == test["expected"]
            status = "✓ PASS" if passed else "✗ FAIL"
            if not passed:
                all_passed = False
            print(f"    Got: {got} — {status}")
            print(f"    Reasoning: {result.get('reasoning', '')}")
            if got in ("press", "support") and result.get("reply_body"):
                print(f"    Reply preview: {result['reply_body'][:100]}...")
        except Exception as e:
            print(f"    ERROR: {e}")
            all_passed = False
    return all_passed


# ── Main triage loop ──────────────────────────────────────────────────────
def triage_inbox(password: str, system_prompt: str, limit: int = 20, dry_run: bool = False) -> None:
    cfg = _resolve_email_config()
    print(f"\n=== Email triage {'(DRY RUN) ' if dry_run else ''}===")
    print(f"Account: {cfg['email']} | IMAP: {cfg['imap_host']}:{cfg['imap_port']} | SMTP: {cfg['smtp_host']}:{cfg['smtp_port']}")
    conn = imap_connect(password, cfg["email"], cfg["imap_host"], cfg["imap_port"])
    try:
        messages = list(fetch_unread(conn, limit=limit))
        print(f"Fetched {len(messages)} unread messages")

        for uid, msg in messages:
            sender = decode_header_value(msg.get("From", ""))
            subject = decode_header_value(msg.get("Subject", ""))
            body = get_body(msg)

            print(f"\n[{uid}] From: {sender}")
            print(f"       Subject: {subject[:80]}")

            try:
                result = classify_email(
                    sender=sender,
                    subject=subject,
                    body=body,
                    system_prompt=system_prompt,
                )
                category = result.get("category", "routine")
                action = result.get("action", "archive")
                print(f"  Category: {category} ({result.get('confidence', 0):.2f}) — {result.get('reasoning', '')}")

                if dry_run:
                    print(f"  [DRY RUN] Would: {action}")
                    if action == "reply":
                        print(f"  Reply preview: {str(result.get('reply_body', ''))[:100]}")
                    record_event(sender, subject, category, f"[dry-run] {action}")
                    continue

                tg_alerted = False

                if action == "reply" and result.get("reply_body"):
                    send_reply(password, msg, result["reply_body"],
                               from_email=cfg["email"], smtp_host=cfg["smtp_host"], smtp_port=cfg["smtp_port"])
                    archive_message(conn, uid, is_gmail=cfg["is_gmail"])
                    record_event(sender, subject, category, "replied+archived")

                elif action == "log-security":
                    log_security_threat(
                        title=result.get("security_title", f"Threat: {subject[:60]}"),
                        content=result.get("security_summary", f"From: {sender}\nSubject: {subject}\n\n{body[:500]}"),
                    )
                    alert_security_intrusion(
                        sender=sender,
                        subject=subject,
                        threat_type=result.get("security_title", category),
                    )
                    tg_alerted = True
                    archive_message(conn, uid, is_gmail=cfg["is_gmail"])
                    record_event(sender, subject, category, "logged+archived", tg_alerted=True)

                elif action == "escalate" and result.get("escalation_subject"):
                    escalate_emergency(
                        subject=result["escalation_subject"],
                        body=result.get("escalation_body", f"From: {sender}\nSubject: {subject}\n\n{body[:1000]}"),
                    )
                    archive_message(conn, uid, is_gmail=cfg["is_gmail"])
                    record_event(sender, subject, category, "escalated+archived")

                else:
                    # spam, routine, or any archive-only action
                    archive_message(conn, uid, is_gmail=cfg["is_gmail"])
                    record_event(sender, subject, category, "archived")

            except Exception as e:
                print(f"  ERROR classifying [{uid}]: {e}")

    finally:
        conn.logout()
    print("\nTriage complete.")


# ── Entry point ───────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AM's autonomous email triage")
    parser.add_argument("--dry-run", action="store_true", help="Classify but don't send/archive")
    parser.add_argument("--limit", type=int, default=20, help="Max unread messages to process")
    parser.add_argument("--test-set", action="store_true", help="Run classification test suite only")
    args = parser.parse_args()

    # Load system prompt
    with open(PROMPT_FILE) as f:
        system_prompt = f.read()

    if args.test_set:
        passed = run_test_set(system_prompt, dry_run=args.dry_run)
        sys.exit(0 if passed else 1)

    password = get_app_password()
    triage_inbox(password, system_prompt, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
