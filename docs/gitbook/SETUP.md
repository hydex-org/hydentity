# GitBook Setup Guide

This folder contains all the documentation structured for GitBook.

## Quick Setup

### Option 1: GitBook Web Interface

1. Go to [gitbook.com](https://www.gitbook.com) and sign in
2. Create a new space
3. Choose "Import content from GitHub" or upload manually
4. Point to this `docs/gitbook` folder
5. GitBook will automatically recognize `SUMMARY.md` as the table of contents

### Option 2: GitHub Sync

1. Create a GitBook space
2. Go to Space Settings → Integrations → GitHub
3. Connect your repository
4. Set the path to `docs/gitbook`
5. GitBook will sync automatically on commits

### Option 3: GitBook CLI

```bash
# Install GitBook CLI (if using legacy gitbook)
npm install -g gitbook-cli

# Navigate to gitbook folder
cd docs/gitbook

# Serve locally
gitbook serve
```

## File Structure

```
gitbook/
├── SUMMARY.md          # Table of contents (REQUIRED for GitBook)
├── README.md           # Landing page
├── overview/
│   ├── what-is-hydentity.md
│   ├── key-features.md
│   └── why-privacy-matters.md
├── how-it-works/
│   ├── architecture.md
│   ├── privacy-flow.md
│   ├── privacy-cash.md
│   └── arcium-mpc.md
├── getting-started/
│   ├── creating-a-vault.md
│   ├── receiving-funds.md
│   ├── withdrawing-funds.md
│   └── privacy-settings.md
├── technical/
│   ├── on-chain-program.md
│   ├── sdk.md
│   └── account-structure.md
├── security.md
└── roadmap.md
```

## Customization

### Theme
In GitBook web interface, you can customize:
- Colors (suggest dark theme with green accent to match brand)
- Logo upload
- Custom domain

### Adding Pages
1. Add new `.md` file in appropriate folder
2. Add entry to `SUMMARY.md`
3. Commit and push

### Updating Content
Simply edit the markdown files and push to GitHub (if synced).

## Brand Colors (for reference)

```
Background: #0a0a0f
Card BG:    #13131a
Green:      #9aef31
Blue:       #60a5fa
Text:       #9ca3af
White:      #f3f4f6
```

## Notes

- All internal links use relative paths
- Images can be added to an `assets/` folder if needed
- Code blocks use standard markdown fencing with language hints
