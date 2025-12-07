# RAMS Data Viewer – Development & Git Workflow

This document explains **how we work with branches**, **how deployments happen**, and the **exact Git commands** to use in common scenarios.

The goal:

- Keep `main` **stable and always deployable** (production).
- Use `dev` for ongoing **integration / development**.
- Use `feature/*` branches for **isolated work** on specific features or fixes.
- Make it easy to pause work, fix a production bug, deploy, and then resume.

---

## 1. Branches Overview

We use three main branch types:

### `main` (Production)

- Always **stable**.
- Auto-deployed to production (`https://datacollection.pavron.com.pk`) via GitHub Actions.
- Only merge into `main` when code is tested and ready.

### `dev` (Development)

- Integration branch.
- Ongoing development happens here.
- May be unstable at times (WIP features).
- Merged **into** `main` when we are ready to release a set of changes.

### `feature/*` (Feature branches)

- Short-lived branches for specific tasks.
- Always branch **off `dev`**.
- Examples:
  - `feature/measurement-tool-ui`
  - `feature/asset-edit-mode`
  - `feature/fix-road-api-error`

---

## 2. Initial Setup (First time on a new machine)

Clone the repo and set up branches:

```bash
# Clone the repository
git clone <YOUR_REPO_SSH_OR_HTTPS_URL>
cd <your-repo-folder>

# Ensure you are on main
git checkout main

# Pull latest main from remote
git pull origin main

# Create dev branch the first time
git checkout -b dev
git push origin dev
```

From now on, both `main` and `dev` exist on GitHub.

---

## 3. Daily Workflow – Working on `dev`

Typical day-to-day coding:

```bash
# 1. Start from latest main
git checkout main
git pull origin main

# 2. Update dev from main
git checkout dev
git merge main        # merge any new stable changes into dev

# 3. Work on dev
# ... edit files ...

# 4. Commit your work
git status
git add .
git commit -m "Describe what you implemented"

# 5. Push dev to remote
git push origin dev
```

You can repeat steps 3–5 as you work on new changes.

---

## 4. Working with `feature/*` Branches

For bigger features or to keep dev cleaner, use feature branches.

### Create a feature branch

Start from `dev`:

```bash
# Make sure dev is up to date
git checkout dev
git pull origin dev

# Create a feature branch from dev
git checkout -b feature/my-awesome-change

# Work on the feature
git add .
git commit -m "Implement part 1 of my awesome change"
git push origin feature/my-awesome-change
```

### Finishing a feature

When the feature is ready and tested:

```bash
git checkout dev
git pull origin dev
git merge feature/my-awesome-change
git push origin dev
```

Optionally, delete the feature branch:

```bash
git branch -d feature/my-awesome-change
git push origin --delete feature/my-awesome-change
```

---

## 5. Releasing `dev` to `main` (Deploy to Production)

```bash
git checkout main
git pull origin main
git merge dev
git push origin main    # triggers deploy
```

Production deploys via GitHub Actions automatically.

---

## 6. Handling Production Bugs Mid‑Feature

```bash
# Save WIP
git add .
git commit -m "WIP: current feature"

# Switch to main and fix
git checkout main
git pull origin main
# fix the bug...
git commit -am "Fix: production bug"
git push origin main    # deploys

# Bring fix back into dev
git checkout dev
git merge main
git push origin dev
```

If working on a feature branch:

```bash
git checkout feature/my-feature
git merge dev
```

---

## 7. Quick Command Cheat Sheet

```bash
# Update main
git checkout main
git pull origin main

# Update dev from main
git checkout dev
git merge main
git push origin dev

# New feature
git checkout dev
git checkout -b feature/my-feature

# Finish feature
git checkout dev
git merge feature/my-feature
git push origin dev

# Release to prod
git checkout main
git merge dev
git push origin main

# Hotfix in prod
git checkout main
git pull origin main
git commit -am "Fix"
git push origin main
git checkout dev
git merge main
```

---

## 8. CI/CD Summary

- Production domain: **https://datacollection.pavron.com.pk**
- Deployment pipeline:
  - GitHub Actions workflow in `.github/workflows/deploy-prod.yml`
  - SSH into droplet (`142.93.219.70`)
  - Runs `/opt/rams-app/data-viewer-django-app/deploy.sh`
  - Rebuilds & restarts Docker containers

---

## 9. General Guidelines

- **Never push untested code to `main`.**
- Always update local branches with:
  ```bash
  git pull origin <branch>
  ```
- Keep commits clear and meaningful.
- Use feature branches for anything non-trivial.

---

This workflow keeps production safe, ensures fast hotfixing, and provides a clean structure for ongoing development.
