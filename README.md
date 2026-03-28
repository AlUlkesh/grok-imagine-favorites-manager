A Chrome extension to bulk-download your favorited Grok Imagine images and videos.

---

## Fork

This is a fork of https://github.com/brndnsmth/grok-imagine-favorites-manager, which was archived in February 2026.

This fork's improvements to the original version:

- Completely reworked capturing method
- Improved speed
- Gets all photo and video variations
- Optional detailed logging
- Collects metadata and saves it as JSON

## ⚠️ IMPORTANT DISCLAIMER — READ BEFORE USE ⚠️

**USE AT YOUR OWN RISK. THIS IS AN UNOFFICIAL, THIRD-PARTY TOOL.**

- **NOT AFFILIATED** with Grok, xAI, or X
- **NO WARRANTY** — This extension is provided "AS IS" without any guarantees
- **NO RESPONSIBILITY** — The developer is not responsible for:
  - Data loss or corruption
  - Account issues or bans
  - API changes breaking functionality
  - Any damages or issues arising from use
- **BREAKING CHANGES EXPECTED** — Grok Imagine is constantly evolving. This extension may break at any time as the platform updates its interface, API endpoints, or policies
- **EXPERIMENTAL SOFTWARE** — Features may be unstable or incomplete
- **YOUR RESPONSIBILITY** — By using this extension, you acknowledge and accept all risks

**If you cannot accept these terms, do not use this extension.**

---

## Features

- Fetches all favorites directly via the Grok REST API (no DOM scraping required)
- Downloads all images and/or videos in one click
- Each download batch is saved to a timestamped subfolder (`grok-imagine/YYYY_MM_DD/HH_MM/`)
- A JSON sidecar file is saved alongside each batch with prompt, model, and metadata
- On-screen progress modal with live updates and cancel support
- Downloads rate-limited to ~3 per second

## Installation

### Step 1: Get the extension files

Clone the repository:

```bash
git clone https://github.com/AlUlkesh/grok-imagine-favorites-manager
```

### Step 2: Load into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `grok-imagine-favorites-manager` folder
5. The extension will appear in your extensions list

### Step 3: Pin the extension (recommended)

Click the puzzle-piece icon in Chrome's toolbar, find the extension, and click the pin icon.

## Usage

1. Log in to your Grok account
2. Navigate to `https://grok.com/imagine/saved`
3. Click the extension icon in the toolbar
4. Choose a download action

### Actions

| Button | Description |
|---|---|
| **Download All Media** | Downloads all images and videos |
| **Download Images Only** | Downloads only images |
| **Download Videos Only** | Downloads only videos |
| **Open Downloads Folder** | Opens `chrome://downloads` |
| **Open Download Settings** | Opens Chrome download settings |
| **Cancel Current Operation** | Stops any in-progress download |

### Debug Logging

Check **Debug Logging** in the popup to enable verbose output in DevTools Console (`F12`). Disabled by default.

## Downloads

Files are saved to your default Chrome downloads folder under:

```
grok-imagine/
  YYYY_MM_DD/
    HH_MM/
      <mediaId>.jpg
      <mediaId>.mp4
      <parentPostId>_info.json   <- prompt, model, metadata
```

Each parent post gets a `_info.json` sidecar file containing:
- Prompt and original prompt
- Model name, mode, media type
- Create time, resolution, video duration
- List of all variant IDs and URLs

## File Structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (MV3) |
| `popup.html` / `popup.js` | Extension popup UI and logic |
| `content.js` | Orchestrates scan → prepare → download flow |
| `background.js` | Download queue management, rate limiting, JSON sidecars |
| `js/constants.js` | Shared selector and config constants |
| `js/utils.js` | Logger, UUID extraction, DOM element helpers |
| `js/api.js` | REST API calls (`/rest/media/post/list`) |
| `js/scanner.js` | Post fetching, media extraction, download preparation |
| `js/ui.js` | Progress modal |

## Technical Notes

- The extension calls `POST https://grok.com/rest/media/post/list` with the authenticated session cookie — the same endpoint the Grok frontend uses internally
- All media variants (images and videos) are returned directly by the API; no tab-opening or DOM walking is needed
- Downloads use `chrome.downloads.download()` — native browser downloads with full cookie and header support
- The DOM scroll fallback in `scanner.js` is retained for cases where the API returns 0 results

## Important Notes

- Keep the tab open while downloads are running
- The extension only works on `https://grok.com/imagine/*` pages
- If the API changes or returns errors, reload the page and retry
- Check the repository for updates if features stop working

## Support

Open an issue on GitHub if you encounter problems. The Grok platform changes frequently; check for updates before reporting bugs.

## Credits

Credits and thanks to the original author https://github.com/brndnsmth and everyone who contributed, esp. https://github.com/masamunet for valuable additions.
