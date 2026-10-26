# BillSplit v2 Dark – Smart Bill Splitter (Offline PWA)

A beautiful, **dark-themed**, fast, fully **offline-capable** Progressive Web App to split restaurant & travel bills with friends. No currency selector, no sign-up, no internet required after the first load.

**Live Demo:** https://splitingbills.netlify.app/

---

## Features

### Bill Details
- **Occasion / label** (e.g. "Trip", "Dinner")
- **Total bill amount**
- **Tax %** with live calculation
- **Tip presets**: 0 / 5 / 10 / 15 / 20 or custom %
- **Live summary**: Subtotal → Tax → Tip → Grand Total

### Members
- Add members one-by-one, OR
- Quick presets: 2 / 3 / 4 / 5 / 6 / 8 / 10 people, OR
- **"N People…"** for any custom count
- Colourful avatar initials per member

### Split Methods
| Method | Description |
|--------|-------------|
| **Equal Split** | Divide the grand total equally |
| **By Percentage** | % share per person (must sum to 100%) |
| **Custom Amount** | Enter exact amounts per person |
| **Item-Based** | Add items & assign them to one or more people |

### Who Paid?
A key feature for real-world scenarios:

- **Everyone Paid Own Share** — no settlement needed
- **One Person Paid Full** — they had bigger notes / cash upfront, others owe them back
- **Multiple People Paid** — 2+ people covered the bill together; settlement is computed

The app uses a **greedy settlement algorithm** to minimise the number of "who pays whom"
transactions. Each debtor is matched with the biggest creditor first.

### Offline PWA
- Installable on phone or desktop (tap **Install** banner when it appears)
- Works **100% offline** after first load
- Cache-first service worker
- No external CDN dependencies — fully self-contained

### History
- Automatically saves last **10 splits** (older ones are pruned)
- Stored locally via `localStorage` — never leaves your device

### Result actions
- Copy to clipboard
- Share via native share sheet (on mobile)
- Save to history


## Project Structure

```
billsplit-v2/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   └── app.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---


## Privacy

- 100% client-side. No analytics, no sign-in, no tracking.
- History & preferences stored only in your browser's `localStorage`.
- Use Clear All to wipe everything.
