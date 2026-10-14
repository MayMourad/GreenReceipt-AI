# GreenReceipt AI

**Every receipt has a story.**

GreenReceipt AI reads a shopping receipt and returns one report covering spending, wellness and sustainability, summarised as a single **PurchaseIQ™** score with practical swap suggestions.

Built by May Ahmed Mourad (sole developer) for **The Knowledge Society (TKS) Prompt to Product Challenge**, July 2026.

**Live site:** https://maymourad.github.io/GreenReceipt-AI/

---

## Two modes

| | Demo mode (default) | Live mode |
| :-- | :-- | :-- |
| Input | One of three sample receipts: grocery run, coffee and snack run, household supplies | A photo of your own receipt |
| Analysis | Pre-built reports stored as JSON in [`data/`](data/); no model call | Anthropic's vision API (`claude-sonnet-5`), called from your browser |
| API key | Not needed | Your own Anthropic API key, typed into the page |

**About the key in live mode.** The key is held in page memory only. It isn't saved to `localStorage`, cookies or any server, and it's sent only to `api.anthropic.com`, using the `anthropic-dangerous-direct-browser-access` header. Anyone running live mode should use a low-limit key that they're comfortable using in a browser.

## How the analysis works

1. **Vision model (third-party).** In live mode the receipt image goes to Claude with a fixed system prompt. That prompt also asks for safe framing: wellness notes are educational, never medical, and spending notes are never financial advice. The model must return **one JSON object** in a fixed schema containing:
   - the extracted items (name, category, estimated price);
   - `purchaseIQ.total` and four equally weighted sub-scores (spending efficiency, wellness, sustainability, waste efficiency), each with a one-line rationale;
   - insights and three recommendations.

   The app strips any code fences, parses the JSON, and rejects any response without a numeric `purchaseIQ.total`.
2. **Receipt Optimization Engine (deterministic, plain JavaScript).** For each item, the engine looks for a swap: first in a catalog of specific items (for example, bottled water → reusable bottle refill), then in category-level fallbacks. It applies at most three swaps and recalculates prices and sub-scores from fixed per-swap deltas. No model is involved, so the same receipt always gives the same result.
3. **Report.** Score rings, item-level highlights by dimension, a "What if?" impact simulator for recommendations, and an inspector that shows the exact prompt used.

The model provides the item-level analysis and the PurchaseIQ sub-scores. The schema, the swap catalog, the optimisation and rescoring logic, and the interface are this project's own code.

## Limits

- Prices, sustainability bands and waste figures are **estimates**, not measurements. There are no carbon-footprint claims.
- Wellness insights are educational only; nothing here is medical or financial advice.
- Swap deltas are illustrative prototype values set in [`app.js`](app.js) (`ITEM_SWAP_OVERRIDES`, `CATEGORY_SWAP_FALLBACK`).
- Live-mode output depends on the model reading the receipt correctly; there is no second-pass verification.

## Run it locally

Static site, no build step. Serve the folder over HTTP, because browsers block `fetch()` of the sample JSON from `file://`:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Structure

```
index.html     page structure and sections
app.js         modes, vision API call, report rendering, swap engine, What-if simulator
hero.js        decorative Three.js hero
ai-core.js     decorative Three.js "AI core" visual
motion.js      GSAP scroll motion
style.css      styles (alongside Tailwind via CDN)
data/          sample receipt reports used by demo mode
```

**Libraries (loaded from CDNs):** Tailwind CSS, Lucide icons, GSAP + ScrollTrigger, Three.js r128.
