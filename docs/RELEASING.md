# Releasing MiniClaw

How versions, tags, and releases work.

---

## Release Channels

MiniClaw has two release channels:

| Channel | Tag | Who it's for | Install command |
|---------|-----|-------------|-----------------|
| **stable** | `stable` | Most users. Tested, reliable. | `curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/stable/bootstrap.sh \| bash` |
| **latest** | `vX.Y.Z` | Early adopters. New features immediately. | `MINICLAW_VERSION=vX.Y.Z ./bootstrap.sh` |

### How it works

- Every release gets a **versioned tag** (e.g. `v0.1.1`, `v0.2.0`).
- A versioned tag is a **prerelease/candidate** — not stable.
- The **`stable` tag** is a moving pointer. It always points to whichever
  versioned tag we consider the most reliable right now.
- `stable` may lag behind the latest version tag — that's intentional.
  New releases get field-tested before we move `stable` forward.
- **No version is marked stable until the human team has tested it.**
  The `stable` tag only moves after manual sign-off.

### Example timeline

```
v0.1.0  ← stable pointed here
v0.1.1  ← released, stable moves here after testing
v0.2.0  ← released with new features, stable stays at v0.1.1
v0.2.1  ← bugfix, stable moves to v0.2.1
```

---

## Cutting a Release

### 1. Bump the version

Update these files to the new version number:

| File | What to change |
|------|---------------|
| `MANIFEST.json` | `"version": "X.Y.Z"` |
| `README.md` | Badge URL `version-vX.Y.Z` |
| `bootstrap.sh` | `MINICLAW_VERSION` default (line ~15) and usage comment (line ~8) |
| `docs/install.md` | Curl example URL and env var table |

### 2. Commit

```bash
git add MANIFEST.json README.md bootstrap.sh docs/install.md
git commit -m "release: vX.Y.Z — <one-line summary>"
```

### 3. Tag the version

```bash
git tag -a vX.Y.Z -m "vX.Y.Z: <summary>"
```

### 4. Human team tests the candidate

The tagged version is a prerelease candidate. The human team tests it
manually before it can become the stable release. Do not move `stable`
until the team has signed off.

### 5. Move `stable` (after human sign-off only)

Only do this after the human team has tested and approved the release:

```bash
git tag -f stable -m "stable release"
```

If testing is not complete, skip this step. Move `stable` later.

### 6. Push

```bash
git push origin main --tags --force
```

The `--force` is needed because `stable` is a moving tag that gets rewritten.
Versioned tags (`vX.Y.Z`) are immutable and never force-pushed.

---

## Version Numbering

We use **semver** (MAJOR.MINOR.PATCH):

- **PATCH** (0.1.0 → 0.1.1): bug fixes, path cleanup, docs
- **MINOR** (0.1.x → 0.2.0): new plugins, new features, config changes
- **MAJOR** (0.x → 1.0): breaking changes to plugin API or directory layout

We're pre-1.0, so minor versions may include breaking changes with notice.

---

## What Users See

### Stable users (default install)

The bootstrap one-liner pulls from the `stable` tag. These users get updates
only when we explicitly move `stable` forward. They're always on a known-good
version.

### Bleeding-edge users

Users who set `MINICLAW_VERSION=vX.Y.Z` or install from `main` get the
latest. They accept that things might break.

### Existing installs

When a user re-runs `bootstrap.sh`, it checks the current version against
`MINICLAW_VERSION`. If different, it fetches tags and checks out the new
version — no destructive re-clone.

---

## Checklist

```
[ ] Version bumped in MANIFEST.json, README.md, bootstrap.sh, docs/install.md
[ ] Changes committed with "release: vX.Y.Z" message
[ ] Version tag created: git tag -a vX.Y.Z
[ ] Human team has tested the candidate release
[ ] (After sign-off) stable tag moved: git tag -f stable
[ ] Pushed: git push origin main --tags --force
[ ] Verified: bootstrap.sh from stable tag works on clean machine
```
