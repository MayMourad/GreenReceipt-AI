(function () {
  "use strict";

  // ---------- Icon helper (Lucide CDN) ----------
  // Progressive enhancement: if the Lucide CDN script fails to load, this is a
  // no-op and icon slots just render empty — never a broken layout.
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      try { window.lucide.createIcons(); } catch (e) { /* ignore */ }
    }
  }

  // ---------- Sample receipt registry ----------
  var SAMPLES = [
    { key: "grocery", title: "Grocery Run", desc: "Balanced weekly basket", file: "data/sample-grocery.json", icon: "shopping-basket", color: "#EEF5F0", iconColor: "#2F7A49" },
    { key: "coffee", title: "Coffee & Snack Run", desc: "Café visit, on the go", file: "data/sample-coffee.json", icon: "coffee", color: "#FBF0DA", iconColor: "#8A5A12" },
    { key: "household", title: "Household Supplies", desc: "Cleaning & essentials", file: "data/sample-household.json", icon: "spray-can", color: "#EAF1FB", iconColor: "#1D4E89" }
  ];

  var PROCESSING_MESSAGES = [
    "Reading receipt…",
    "Identifying items…",
    "Calculating PurchaseIQ™…",
    "Generating insights…"
  ];
  var PROCESSING_DURATION = 2600;

  var jsonCache = {};
  var currentReportData = null;
  var activeFilterDimension = null;

  // The exact prompt design documented in this project's own spec (Section 7,
  // AI Integration Plan) — shown verbatim in the inspector, not fabricated.
  var SYSTEM_PROMPT =
    "You are GreenReceipt AI's receipt analysis engine. Given a receipt image, " +
    "extract every purchased item with its category and estimated price. " +
    "Categorize each item (produce, dairy, beverage, protein, pantry, bakery, " +
    "household, snack, prepared food, etc.).\n\n" +
    "Compute purchaseIQ.total as a reasoned combination of four equally-weighted " +
    "sub-scores (spendingEfficiency, wellness, sustainability, wasteEfficiency), " +
    "each with a one-line rationale grounded in the actual extracted items — never " +
    "a generic or arbitrary-feeling explanation.\n\n" +
    "Wellness insights: educational framing only, never diagnostic or medical. " +
    "Omit entirely if no food items are detected.\n" +
    "Sustainability insights: qualitative bands (Low/Moderate/High) with reasoning " +
    "— never claim precise carbon-footprint figures.\n" +
    "Spending insights: observational framing only — never investment or " +
    "financial advice.\n" +
    "Recommendations: exactly three, one each tagged Financial/Sustainability/" +
    "Wellness, always framed positively and practically, each paired with a " +
    "one-line rationale.\n\n" +
    "Output must be a single valid JSON object matching the schema exactly — " +
    "no prose outside the JSON, no markdown code fences.";

  // Primary PurchaseIQ dimension each item category is most associated with —
  // used to highlight/dim receipt items when a subscore ring is clicked.
  var CATEGORY_PRIMARY_DIMENSION = {
    produce: "wellness",
    dairy: "wellness",
    protein: "wellness",
    bakery: "wellness",
    beverage: "sustainability",
    household: "sustainability",
    snack: "spendingEfficiency",
    "prepared food": "spendingEfficiency",
    pantry: "wasteEfficiency"
  };
  var DIMENSION_ACCENT = {
    spendingEfficiency: "#FBBF24",
    wellness: "#FB7185",
    sustainability: "#4ADE80",
    wasteEfficiency: "#38BDF8"
  };

  // ---------- View management ----------
  var views = ["landing", "upload", "processing", "report"];
  var topbar = document.getElementById("topbar");
  var topbarStep = document.getElementById("topbar-step");

  function showView(name) {
    views.forEach(function (v) {
      var el = document.getElementById("view-" + v);
      el.classList.toggle("hidden", v !== name);
      if (v === name) {
        el.classList.remove("view");
        void el.offsetWidth;
        el.classList.add("view");
      }
    });
    var stepLabels = { upload: "Step 1 of 2 — Upload", processing: "Analyzing…", report: "Purchase Intelligence Report" };
    topbarStep.textContent = stepLabels[name] || "";
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // ---------- Sample cards ----------
  function renderSampleCards() {
    var container = document.getElementById("sample-cards");
    container.innerHTML = SAMPLES.map(function (s, i) {
      return (
        '<button class="sample-card fade-up" style="--d:' + (i * 70) + 'ms" data-key="' + s.key + '">' +
          '<div class="sample-thumb" style="background:' + s.color + '">' +
            '<i data-lucide="' + s.icon + '" style="color:' + s.iconColor + '"></i>' +
          "</div>" +
          '<p class="font-medium text-[15px]">' + s.title + "</p>" +
          '<p class="text-sm text-ink/45 mt-0.5">' + s.desc + "</p>" +
        "</button>"
      );
    }).join("");

    Array.prototype.forEach.call(container.querySelectorAll(".sample-card"), function (btn) {
      btn.addEventListener("click", function () {
        loadSample(btn.getAttribute("data-key"));
      });
    });
    refreshIcons();
  }

  function loadSample(key) {
    var sample = SAMPLES.filter(function (s) { return s.key === key; })[0];
    if (!sample) return;

    hideUploadNotice();
    showView("processing");
    runProcessingSequence();

    fetchJSON(sample.file)
      .then(function (data) {
        waitForProcessing().then(function () {
          renderReport(data);
          showView("report");
        });
      })
      .catch(function () {
        waitForProcessing().then(function () {
          showView("upload");
          showUploadNotice(
            "We couldn't load that sample right now. Please try another sample receipt — the demo data is bundled locally and should always work."
          );
        });
      });
  }

  function fetchJSON(path) {
    if (jsonCache[path]) return Promise.resolve(jsonCache[path]);
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error("Failed to load " + path);
      return res.json();
    }).then(function (data) {
      jsonCache[path] = data;
      return data;
    });
  }

  // ---------- Processing animation ----------
  var processingToken = 0;

  function runProcessingSequence() {
    var myToken = ++processingToken;
    var textEl = document.getElementById("processing-text");
    var fill = document.getElementById("processing-progress-fill");
    var i = 0;
    textEl.style.opacity = 1;
    textEl.textContent = PROCESSING_MESSAGES[0];

    if (fill) {
      fill.style.transition = "none";
      fill.style.width = "0%";
      void fill.offsetWidth;
      fill.style.transition = "";
      setTimeout(function () {
        if (myToken !== processingToken) return;
        fill.style.transitionDuration = PROCESSING_DURATION + "ms";
        fill.style.width = "100%";
      }, 30);
    }

    function step() {
      if (myToken !== processingToken) return;
      i++;
      if (i >= PROCESSING_MESSAGES.length) return;
      textEl.style.opacity = 0;
      setTimeout(function () {
        if (myToken !== processingToken) return;
        textEl.textContent = PROCESSING_MESSAGES[i];
        textEl.style.opacity = 1;
        setTimeout(step, 650);
      }, 180);
    }
    setTimeout(step, 650);
  }

  function waitForProcessing() {
    return new Promise(function (resolve) {
      setTimeout(resolve, PROCESSING_DURATION);
    });
  }

  // ---------- Upload notice (no live AI in this build) ----------
  function showUploadNotice(msg) {
    var el = document.getElementById("upload-notice");
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  function hideUploadNotice() {
    document.getElementById("upload-notice").classList.add("hidden");
  }

  // ---------- Report rendering ----------
  var SUBSCORE_LABELS = {
    spendingEfficiency: "Spending Efficiency",
    wellness: "Wellness",
    sustainability: "Sustainability",
    wasteEfficiency: "Waste Efficiency"
  };
  var SUBSCORE_ICONS = {
    spendingEfficiency: "line-chart",
    wellness: "heart-pulse",
    sustainability: "leaf",
    wasteEfficiency: "recycle"
  };
  var SUBSCORE_ORDER = ["spendingEfficiency", "wellness", "sustainability", "wasteEfficiency"];

  // Category -> { icon, gradient } for the itemized receipt list. Each icon chip
  // uses a two-stop gradient + inset highlight so it reads as a small raised badge.
  var CATEGORY_STYLES = {
    produce: { icon: "leaf", from: "#4ADE80", to: "#16A34A" },
    dairy: { icon: "milk", from: "#7DD3FC", to: "#0284C7" },
    beverage: { icon: "cup-soda", from: "#67E8F9", to: "#0891B2" },
    protein: { icon: "drumstick", from: "#FDBA74", to: "#EA580C" },
    pantry: { icon: "package", from: "#FCD34D", to: "#B45309" },
    bakery: { icon: "wheat", from: "#FDE68A", to: "#92400E" },
    household: { icon: "spray-can", from: "#C4B5FD", to: "#6D28D9" },
    snack: { icon: "cookie", from: "#E1B48C", to: "#78350F" },
    "prepared food": { icon: "utensils", from: "#F9A8D4", to: "#BE185D" }
  };
  var DEFAULT_CATEGORY_STYLE = { icon: "shopping-bag", from: "#D1D5DB", to: "#6B7280" };

  var MAIN_RING_ACCENT = "#34D399";

  // ---------- Receipt Optimization Engine: swap catalog ----------
  // Specific, realistic swaps for known items (checked first — more compelling
  // and concrete than a generic category swap). "priceDelta" is signed (negative
  // = cheaper). Subscore point deltas are modest per-swap so 2-3 stacked swaps
  // move the score meaningfully without ever forcing it to 100 — the formula
  // does the work, nothing here is hand-tuned per sample receipt.
  var ITEM_SWAP_OVERRIDES = [
    { match: "sparkling water", name: "Home Carbonation Refill", tag: "eco", priceDelta: -3.50, sustainabilityPts: 9, wastePts: 6, wellnessPts: 0, wasteKg: 9.4 },
    { match: "bottled water", name: "Reusable Bottle Refill", tag: "eco", priceDelta: -2.00, sustainabilityPts: 8, wastePts: 5, wellnessPts: 0, wasteKg: 6.8 },
    { match: "banana", name: "Local Seasonal Fruit (UAE Farm)", tag: "local", priceDelta: -0.30, sustainabilityPts: 4, wastePts: 2, wellnessPts: 2, wasteKg: 0.3 },
    { match: "dish soap", name: "Refillable Dish Soap Concentrate", tag: "eco", priceDelta: -0.80, sustainabilityPts: 6, wastePts: 4, wellnessPts: 0, wasteKg: 1.1 },
    { match: "laundry detergent", name: "Detergent Refill Pouch", tag: "bulk", priceDelta: -2.50, sustainabilityPts: 7, wastePts: 5, wellnessPts: 0, wasteKg: 2.4 },
    { match: "all-purpose cleaner", name: "Refillable All-Purpose Cleaner", tag: "eco", priceDelta: -1.20, sustainabilityPts: 6, wastePts: 4, wellnessPts: 0, wasteKg: 1.3 },
    { match: "trash bags", name: "Compostable Trash Bags", tag: "eco", priceDelta: 0.50, sustainabilityPts: 5, wastePts: 6, wellnessPts: 0, wasteKg: 1.0 },
    { match: "bag of chips", name: "Fresh Fruit Cup (Local Produce)", tag: "local", priceDelta: -0.75, sustainabilityPts: 4, wastePts: 3, wellnessPts: 6, wasteKg: 0.4 },
    { match: "blueberry muffin", name: "Whole-Grain Energy Bar", tag: "eco", priceDelta: -0.50, sustainabilityPts: 3, wastePts: 2, wellnessPts: 5, wasteKg: 0.3 }
  ];
  // Fallback for anything not covered above, keyed by category. Produce only
  // qualifies if explicitly tagged "Imported" (nothing to swap for local
  // produce that's already local).
  var CATEGORY_SWAP_FALLBACK = {
    beverage: { namePrefix: "Reusable Refill Alternative", tag: "eco", priceDelta: -1.50, sustainabilityPts: 6, wastePts: 4, wellnessPts: 0, wasteKg: 3.0 },
    household: { namePrefix: "Refill Concentrate Alternative", tag: "eco", priceDelta: -1.00, sustainabilityPts: 5, wastePts: 4, wellnessPts: 0, wasteKg: 1.5 },
    snack: { namePrefix: "Local Snack Alternative", tag: "local", priceDelta: -0.50, sustainabilityPts: 3, wastePts: 2, wellnessPts: 4, wasteKg: 0.3 },
    "prepared food": { namePrefix: "Fresh Local Alternative", tag: "eco", priceDelta: -0.50, sustainabilityPts: 3, wastePts: 2, wellnessPts: 3, wasteKg: 0.3 },
    produce: { namePrefix: "Local", tag: "local", priceDelta: -0.30, sustainabilityPts: 4, wastePts: 2, wellnessPts: 2, wasteKg: 0.3 }
  };
  var SWAP_TAG_LABELS = { eco: "Eco-Swap", local: "Local Produce", bulk: "Bulk Refill" };
  var MAX_SWAPS = 3;

  var currentOptimizedData = null;
  var previewingOptimized = false;

  function renderReport(data) {
    currentReportData = data;
    document.getElementById("report-label").textContent = data.receiptLabel || "Receipt";
    document.getElementById("report-subtitle").textContent = data.receiptSubtitle || "";

    renderItems(data.extractedItems);

    // Main PurchaseIQ ring + count-up
    var total = (data.purchaseIQ && data.purchaseIQ.total) || 0;
    var ringEl = document.getElementById("score-ring-conic");
    var scoreEl = document.getElementById("score-total");
    ringEl.style.setProperty("--score-percent", 0);
    ringEl.style.setProperty("--ring-accent-color", MAIN_RING_ACCENT);
    scoreEl.textContent = "0";

    setTimeout(function () {
      animateRingPercent(ringEl, total, 1100);
      animateCountUp(scoreEl, total, 1100);
    }, 150);

    // Sub-score mini rings
    var subEl = document.getElementById("subscores");
    var subScores = (data.purchaseIQ && data.purchaseIQ.subScores) || {};
    subEl.innerHTML = SUBSCORE_ORDER.map(function (key, idx) {
      var s = subScores[key] || { score: 0, rationale: "" };
      var accent = DIMENSION_ACCENT[key] || MAIN_RING_ACCENT;
      return (
        '<div class="subscore-item subscore-' + key + ' fade-up" style="--d:' + (idx * 90 + 200) + 'ms">' +
          '<div class="subscore-icon-badge"><i data-lucide="' + SUBSCORE_ICONS[key] + '"></i></div>' +
          '<div class="subscore-ring-wrap">' +
            '<div class="score-ring-conic score-ring-conic--sub" data-target="' + s.score + '" style="--score-percent:0; --ring-accent-color:' + accent + ';">' +
              '<div class="subscore-ring-value">' + s.score + "</div>" +
            "</div>" +
          "</div>" +
          '<p class="subscore-name">' + SUBSCORE_LABELS[key] + "</p>" +
          '<p class="subscore-rationale">' + escapeHTML(s.rationale) + "</p>" +
        "</div>"
      );
    }).join("");

    setTimeout(function () {
      Array.prototype.forEach.call(subEl.querySelectorAll(".score-ring-conic--sub"), function (r) {
        var target = parseFloat(r.getAttribute("data-target")) || 0;
        animateRingPercent(r, target, 900);
      });
    }, 300);

    Array.prototype.forEach.call(subEl.querySelectorAll(".subscore-item"), function (el) {
      var key = SUBSCORE_ORDER.filter(function (k) { return el.classList.contains("subscore-" + k); })[0];
      if (key) el.addEventListener("click", function () { applyFilter(key); });
    });

    // Spending insights
    renderList("spending-list", data.spendingInsights);

    // Wellness insights (conditional)
    var wellnessCard = document.getElementById("wellness-card");
    if (data.wellnessInsights && data.wellnessInsights.length) {
      wellnessCard.classList.remove("hidden");
      renderList("wellness-list", data.wellnessInsights);
    } else {
      wellnessCard.classList.add("hidden");
    }

    // Sustainability
    var si = data.sustainabilityInsights || {};
    var bandsEl = document.getElementById("sustainability-bands");
    var bandFields = [
      ["Packaging Impact", si.packagingImpact],
      ["Single-Use Plastic", si.singleUsePlastic],
      ["Local Purchasing", si.localPurchasingEstimate],
      ["Waste Generation", si.wasteGeneration]
    ];
    bandsEl.innerHTML = bandFields.map(function (f) {
      var label = f[0], val = f[1] || "Moderate";
      return (
        '<div class="band-pill">' +
          '<span class="band-label">' + label + "</span>" +
          '<span class="band-badge band-' + val + '">' + val + "</span>" +
        "</div>"
      );
    }).join("");
    document.getElementById("sustainability-reasoning").textContent = si.reasoning || "";

    var regionalBox = document.getElementById("regional-context-box");
    if (si.regionalContext) {
      regionalBox.classList.remove("hidden");
      document.getElementById("regional-context-text").textContent = si.regionalContext;
    } else {
      regionalBox.classList.add("hidden");
    }

    // Recommendations
    var recEl = document.getElementById("recommendations");
    var recs = data.recommendations || [];
    var recIcons = { Financial: "wallet", Sustainability: "recycle", Wellness: "heart-pulse" };
    recEl.innerHTML = recs.map(function (r, idx) {
      return (
        '<div class="rec-card fade-up" style="--d:' + (idx * 80) + 'ms">' +
          '<span class="rec-tag rec-' + r.category + '"><i data-lucide="' + (recIcons[r.category] || "check") + '"></i>' + r.category + "</span>" +
          '<p class="rec-text">' + escapeHTML(r.text) + "</p>" +
          (r.rationale ? '<p class="rec-rationale">' + escapeHTML(r.rationale) + "</p>" : "") +
          (r.whatIf ? '<button class="rec-simulate-btn" data-idx="' + idx + '" type="button"><i data-lucide="sparkles"></i> Simulate Impact</button>' : "") +
        "</div>"
      );
    }).join("");

    Array.prototype.forEach.call(recEl.querySelectorAll(".rec-simulate-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-idx"), 10);
        openWhatIfDrawer(recs[idx]);
      });
    });

    renderOptimizeSection(data);
    renderInspector(data);

    refreshIcons();
  }

  function renderItems(items) {
    var listEl = document.getElementById("items-list");
    var totalEl = document.getElementById("items-total");
    items = items || [];

    listEl.innerHTML = items.map(function (item, idx) {
      var category = (item.category || "").toLowerCase();
      var style = CATEGORY_STYLES[category] || DEFAULT_CATEGORY_STYLE;
      var price = typeof item.estimatedPrice === "number" ? "$" + item.estimatedPrice.toFixed(2) : "";
      var dimension = CATEGORY_PRIMARY_DIMENSION[category] || "";
      var origin = item.origin
        ? '<span class="item-origin-tag item-origin-' + escapeHTML(item.origin) + '">' + escapeHTML(item.origin) + "</span>"
        : "";
      return (
        '<div class="item-row fade-up" data-dimension="' + dimension + '" style="--d:' + Math.min(idx * 40, 400) + 'ms">' +
          '<div class="item-icon" style="background:linear-gradient(145deg,' + style.from + "," + style.to + ')">' +
            '<i data-lucide="' + style.icon + '"></i>' +
          "</div>" +
          '<div class="item-info">' +
            '<p class="item-name">' + escapeHTML(item.name) + "</p>" +
            '<p class="item-category">' + escapeHTML(item.category || "") + origin + "</p>" +
          "</div>" +
          '<p class="item-price">' + price + "</p>" +
        "</div>"
      );
    }).join("");

    var total = items.reduce(function (sum, item) {
      return sum + (typeof item.estimatedPrice === "number" ? item.estimatedPrice : 0);
    }, 0);
    totalEl.textContent = "$" + total.toFixed(2);

    activeFilterDimension = null;
    document.getElementById("clear-filter-btn").classList.add("hidden");
    document.getElementById("filter-caption").classList.add("hidden");
  }

  // ---------- Sub-score traceability filter ----------
  function applyFilter(dimension) {
    var rows = document.querySelectorAll(".item-row");
    var clearBtn = document.getElementById("clear-filter-btn");
    var caption = document.getElementById("filter-caption");

    if (activeFilterDimension === dimension) {
      // Toggling the same ring again clears the filter.
      clearFilter();
      return;
    }

    activeFilterDimension = dimension;

    Array.prototype.forEach.call(document.querySelectorAll(".subscore-item"), function (el) {
      el.classList.toggle("is-selected", el.classList.contains("subscore-" + dimension));
    });

    var matchCount = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var match = row.getAttribute("data-dimension") === dimension;
      if (match) matchCount++;
      row.classList.toggle("is-highlighted", match);
      row.classList.toggle("is-dimmed", !match);
      row.style.setProperty("--row-accent", DIMENSION_ACCENT[dimension] || "");
    });

    clearBtn.classList.remove("hidden");
    caption.classList.remove("hidden");
    caption.textContent = matchCount > 0
      ? "Highlighting items most relevant to " + SUBSCORE_LABELS[dimension] + " (" + matchCount + " of " + rows.length + ")."
      : "No items on this receipt are strongly associated with " + SUBSCORE_LABELS[dimension] + ".";
  }

  function clearFilter() {
    activeFilterDimension = null;
    Array.prototype.forEach.call(document.querySelectorAll(".subscore-item"), function (el) {
      el.classList.remove("is-selected");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".item-row"), function (row) {
      row.classList.remove("is-highlighted", "is-dimmed");
    });
    document.getElementById("clear-filter-btn").classList.add("hidden");
    document.getElementById("filter-caption").classList.add("hidden");
  }

  // ---------- Receipt Optimization Engine ----------
  function clamp(n) { return Math.max(0, Math.min(100, n)); }

  // Finds a swap candidate for a single item. Returns null if nothing in the
  // catalog applies — not every item is swappable, and that's fine.
  function findSwapForItem(item) {
    var name = (item.name || "").toLowerCase();
    var category = (item.category || "").toLowerCase();

    for (var i = 0; i < ITEM_SWAP_OVERRIDES.length; i++) {
      if (name.indexOf(ITEM_SWAP_OVERRIDES[i].match) !== -1) {
        return { specific: true, rule: ITEM_SWAP_OVERRIDES[i], newName: ITEM_SWAP_OVERRIDES[i].name };
      }
    }

    if (category === "produce" && item.origin === "Imported") {
      var produceRule = CATEGORY_SWAP_FALLBACK.produce;
      return { specific: false, rule: produceRule, newName: produceRule.namePrefix + " " + item.name };
    }
    if (CATEGORY_SWAP_FALLBACK[category] && category !== "produce") {
      var rule = CATEGORY_SWAP_FALLBACK[category];
      return { specific: false, rule: rule, newName: rule.namePrefix + ": " + item.name };
    }
    return null;
  }

  // Processes the extracted receipt array, identifies 2-3 candidate items for
  // replacement, and recalculates totals/scores from the swaps actually
  // chosen — nothing here is pre-baked per sample, it runs on whatever
  // extractedItems array it's given.
  function generateOptimizedReceipt(originalData) {
    var items = originalData.extractedItems || [];
    var candidates = items.map(function (item, index) {
      return { item: item, index: index, swap: findSwapForItem(item) };
    }).filter(function (c) { return c.swap !== null; });

    // Prefer specific, named swaps over generic category fallbacks — more
    // concrete and realistic — then fill remaining slots by price (biggest
    // visible impact first).
    candidates.sort(function (a, b) {
      if (a.swap.specific !== b.swap.specific) return a.swap.specific ? -1 : 1;
      return (b.item.estimatedPrice || 0) - (a.item.estimatedPrice || 0);
    });
    var chosen = candidates.slice(0, MAX_SWAPS);
    var chosenIndexes = chosen.map(function (c) { return c.index; });

    var newItems = items.map(function (item, index) {
      var match = chosen.filter(function (c) { return c.index === index; })[0];
      if (!match) return { name: item.name, category: item.category, estimatedPrice: item.estimatedPrice, origin: item.origin, swapped: false };
      var rule = match.swap.rule;
      return {
        name: match.swap.newName,
        category: item.category,
        estimatedPrice: Math.max(0, (item.estimatedPrice || 0) + rule.priceDelta),
        swapped: true,
        tag: rule.tag,
        priceDelta: rule.priceDelta,
        sustainabilityPts: rule.sustainabilityPts,
        wastePts: rule.wastePts,
        wellnessPts: rule.wellnessPts,
        wasteKg: rule.wasteKg,
        originalName: item.name
      };
    });

    var totalPriceDelta = chosen.reduce(function (sum, c) { return sum + c.swap.rule.priceDelta; }, 0);
    var totalWasteKg = chosen.reduce(function (sum, c) { return sum + c.swap.rule.wasteKg; }, 0);
    var sustainabilityPts = chosen.reduce(function (sum, c) { return sum + c.swap.rule.sustainabilityPts; }, 0);
    var wastePts = chosen.reduce(function (sum, c) { return sum + c.swap.rule.wastePts; }, 0);
    var wellnessPts = chosen.reduce(function (sum, c) { return sum + c.swap.rule.wellnessPts; }, 0);
    var spendingPts = chosen.reduce(function (sum, c) { return sum + (c.swap.rule.priceDelta < 0 ? 4 : -2); }, 0);

    var oldSub = (originalData.purchaseIQ && originalData.purchaseIQ.subScores) || {};
    var oldTotal = (originalData.purchaseIQ && originalData.purchaseIQ.total) || 0;

    var newSub = {
      spendingEfficiency: clamp((oldSub.spendingEfficiency ? oldSub.spendingEfficiency.score : 0) + spendingPts),
      wellness: clamp((oldSub.wellness ? oldSub.wellness.score : 0) + wellnessPts),
      sustainability: clamp((oldSub.sustainability ? oldSub.sustainability.score : 0) + sustainabilityPts),
      wasteEfficiency: clamp((oldSub.wasteEfficiency ? oldSub.wasteEfficiency.score : 0) + wastePts)
    };
    var avgDelta = (
      (newSub.spendingEfficiency - (oldSub.spendingEfficiency ? oldSub.spendingEfficiency.score : 0)) +
      (newSub.wellness - (oldSub.wellness ? oldSub.wellness.score : 0)) +
      (newSub.sustainability - (oldSub.sustainability ? oldSub.sustainability.score : 0)) +
      (newSub.wasteEfficiency - (oldSub.wasteEfficiency ? oldSub.wasteEfficiency.score : 0))
    ) / 4;
    var newTotal = clamp(Math.round(oldTotal + avgDelta));

    return {
      chosenCount: chosen.length,
      newItems: newItems,
      oldTotalPrice: items.reduce(function (s, it) { return s + (it.estimatedPrice || 0); }, 0),
      newTotalPrice: items.reduce(function (s, it) { return s + (it.estimatedPrice || 0); }, 0) + totalPriceDelta,
      totalPriceDelta: totalPriceDelta,
      totalWasteKg: totalWasteKg,
      oldTotal: oldTotal,
      newTotal: newTotal,
      newSubScores: newSub,
      wellnessImproved: wellnessPts > 0
    };
  }

  function buildOptimizeNoteText(originalData, result) {
    if (result.chosenCount === 0) {
      return "This basket is already lean — no strong swap candidates stood out against the catalog of eco-friendly alternatives we checked.";
    }
    var swappedNames = result.newItems.filter(function (i) { return i.swapped; }).map(function (i) { return i.name; });
    var itemWord = result.chosenCount === 1 ? "item" : "items";
    var costClause = result.totalPriceDelta < 0
      ? "saves $" + Math.abs(result.totalPriceDelta).toFixed(2) + " on this basket"
      : "costs $" + result.totalPriceDelta.toFixed(2) + " more on this basket (a common trade-off for compostable or certified options)";

    var s1 = "By swapping " + result.chosenCount + " " + itemWord + " — " + swappedNames.join(", ") +
      " — for the alternatives above, this suggested basket " + costClause +
      " and avoids an estimated " + result.totalWasteKg.toFixed(1) + " kg of packaging waste per year.";
    var s2 = "Your PurchaseIQ™ score would move from " + result.oldTotal + " to " + result.newTotal +
      (result.wellnessImproved ? ", with a meaningful lift to Wellness alongside Sustainability." : ", driven mainly by the Sustainability and Waste Efficiency gains.");
    var s3 = "This is a projected AI estimate to illustrate the impact of the recommendations above — not an automatic change to your receipt.";
    return s1 + " " + s2 + " " + s3;
  }

  function renderOptimizeItemRow(item, isNewColumn) {
    var category = (item.category || "").toLowerCase();
    var style = CATEGORY_STYLES[category] || DEFAULT_CATEGORY_STYLE;
    var priceText = "$" + (item.estimatedPrice || 0).toFixed(2);

    if (!isNewColumn || !item.swapped) {
      return (
        '<div class="item-row">' +
          '<div class="item-icon" style="background:linear-gradient(145deg,' + style.from + "," + style.to + ')"><i data-lucide="' + style.icon + '"></i></div>' +
          '<div class="item-info"><p class="item-name">' + escapeHTML(item.name) + '</p><p class="item-category">' + escapeHTML(item.category || "") + "</p></div>" +
          '<p class="item-price">' + priceText + "</p>" +
        "</div>"
      );
    }

    var tagClass = "swap-tag--" + item.tag;
    var priceDeltaClass = item.priceDelta < 0 ? "delta-badge--price-down" : "delta-badge--price-up";
    var priceDeltaText = (item.priceDelta < 0 ? "-$" : "+$") + Math.abs(item.priceDelta).toFixed(2);

    return (
      '<div class="item-row optimize-swapped-row">' +
        '<div class="item-icon" style="background:linear-gradient(145deg,' + style.from + "," + style.to + ')"><i data-lucide="' + style.icon + '"></i></div>' +
        '<div class="item-info">' +
          '<p class="item-name">' + escapeHTML(item.name) + ' <span class="swap-tag ' + tagClass + '">' + SWAP_TAG_LABELS[item.tag] + "</span></p>" +
          '<p class="item-category">' + escapeHTML(item.category || "") + "</p>" +
          '<div class="swap-deltas">' +
            '<span class="delta-badge ' + priceDeltaClass + '">' + priceDeltaText + "</span>" +
            '<span class="delta-badge delta-badge--sustain">+' + item.sustainabilityPts + " Sustainability Pts</span>" +
            (item.wellnessPts > 0 ? '<span class="delta-badge delta-badge--wellness">+' + item.wellnessPts + " Wellness Pts</span>" : "") +
          "</div>" +
        "</div>" +
        '<p class="item-price">' + priceText + "</p>" +
      "</div>"
    );
  }

  function renderOptimizeSection(data) {
    currentOptimizedData = generateOptimizedReceipt(data);
    var result = currentOptimizedData;

    document.getElementById("optimize-original-items").innerHTML = (data.extractedItems || []).map(function (item) {
      return renderOptimizeItemRow({ name: item.name, category: item.category, estimatedPrice: item.estimatedPrice }, false);
    }).join("");
    document.getElementById("optimize-original-total").textContent = "$" + result.oldTotalPrice.toFixed(2);

    document.getElementById("optimize-new-items").innerHTML = result.newItems.map(function (item) {
      return renderOptimizeItemRow(item, true);
    }).join("");
    document.getElementById("optimize-new-total").textContent = "$" + result.newTotalPrice.toFixed(2);

    document.getElementById("optimize-note-text").textContent = buildOptimizeNoteText(data, result);

    var applyBtn = document.getElementById("apply-eco-swaps-btn");
    var applyLabel = document.getElementById("apply-eco-swaps-label");
    previewingOptimized = false;
    applyBtn.classList.remove("is-active");
    applyBtn.disabled = result.chosenCount === 0;
    applyLabel.textContent = result.chosenCount === 0 ? "No Swaps to Apply" : "Apply Eco-Swaps";
    document.getElementById("score-preview-tag").classList.add("hidden");

    refreshIcons();
  }

  function toggleEcoSwapPreview(originalData) {
    if (!currentOptimizedData || currentOptimizedData.chosenCount === 0) return;
    var applyBtn = document.getElementById("apply-eco-swaps-btn");
    var applyLabel = document.getElementById("apply-eco-swaps-label");
    var previewTag = document.getElementById("score-preview-tag");

    previewingOptimized = !previewingOptimized;

    var ringEl = document.getElementById("score-ring-conic");
    var scoreEl = document.getElementById("score-total");
    var subEl = document.getElementById("subscores");
    var oldSub = (originalData.purchaseIQ && originalData.purchaseIQ.subScores) || {};

    if (previewingOptimized) {
      applyBtn.classList.add("is-active");
      applyLabel.textContent = "Reset to Original Score";
      previewTag.classList.remove("hidden");
      animateRingPercent(ringEl, currentOptimizedData.newTotal, 700);
      animateCountUp(scoreEl, currentOptimizedData.newTotal, 700);
      SUBSCORE_ORDER.forEach(function (key) {
        var ring = subEl.querySelector(".subscore-" + key + " .score-ring-conic--sub");
        var valueEl = subEl.querySelector(".subscore-" + key + " .subscore-ring-value");
        if (ring) animateRingPercent(ring, currentOptimizedData.newSubScores[key], 700);
        if (valueEl) valueEl.textContent = currentOptimizedData.newSubScores[key];
      });
    } else {
      applyBtn.classList.remove("is-active");
      applyLabel.textContent = "Apply Eco-Swaps";
      previewTag.classList.add("hidden");
      var oldTotal = (originalData.purchaseIQ && originalData.purchaseIQ.total) || 0;
      animateRingPercent(ringEl, oldTotal, 700);
      animateCountUp(scoreEl, oldTotal, 700);
      SUBSCORE_ORDER.forEach(function (key) {
        var ring = subEl.querySelector(".subscore-" + key + " .score-ring-conic--sub");
        var valueEl = subEl.querySelector(".subscore-" + key + " .subscore-ring-value");
        var val = oldSub[key] ? oldSub[key].score : 0;
        if (ring) animateRingPercent(ring, val, 700);
        if (valueEl) valueEl.textContent = val;
      });
    }
  }

  function renderList(id, items) {
    var el = document.getElementById(id);
    el.innerHTML = (items || []).map(function (t) {
      return "<li>" + escapeHTML(t) + "</li>";
    }).join("");
  }

  function animateCountUp(el, target, duration) {
    var steps = 30;
    var stepDuration = duration / steps;
    var tick = 0;
    var interval = setInterval(function () {
      tick++;
      var progress = Math.min(tick / steps, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased);
      if (progress >= 1) {
        clearInterval(interval);
        el.textContent = target;
      }
    }, stepDuration);
    // Safety net: guarantee the correct final value even if the interval
    // gets throttled (e.g. a backgrounded tab), so the score never sticks at 0.
    setTimeout(function () {
      clearInterval(interval);
      el.textContent = target;
    }, duration + 250);
  }

  // Animates a conic-gradient ring's --score-percent from 0 to target.
  // Ticks the custom property directly via JS rather than relying on a CSS
  // transition on the custom property (unregistered custom props used inside
  // calc() don't reliably interpolate across browsers) — same safety-net
  // pattern as animateCountUp so the ring can never get stuck unfilled.
  function animateRingPercent(el, target, duration) {
    var steps = 30;
    var stepDuration = duration / steps;
    var tick = 0;
    var interval = setInterval(function () {
      tick++;
      var progress = Math.min(tick / steps, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.style.setProperty("--score-percent", (target * eased).toFixed(1));
      if (progress >= 1) {
        clearInterval(interval);
        el.style.setProperty("--score-percent", target);
      }
    }, stepDuration);
    setTimeout(function () {
      clearInterval(interval);
      el.style.setProperty("--score-percent", target);
    }, duration + 250);
  }

  function escapeHTML(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------- What If? Impact Simulator ----------
  var whatifDrawer = document.getElementById("whatif-drawer");
  var whatifBackdrop = document.getElementById("whatif-backdrop");

  function openWhatIfDrawer(rec) {
    var w = rec.whatIf;
    if (!w) return;

    document.getElementById("whatif-title").textContent = rec.category + " Recommendation";
    document.getElementById("whatif-recap").textContent = rec.text;
    document.getElementById("whatif-savings").textContent = "$" + w.monthlySavings.toFixed(2) + "/mo";
    document.getElementById("whatif-waste").textContent = w.annualWasteAvoidedKg.toFixed(1) + " kg/yr";

    var impact = w.subscoreImpact || {};
    var label = SUBSCORE_LABELS[impact.key] || "Subscore";
    document.getElementById("whatif-subscore-label").textContent = label + " Subscore";
    document.getElementById("whatif-subscore-values").textContent = impact.from + " → " + impact.to;

    var beforeBar = document.getElementById("whatif-subscore-before-bar");
    var afterBar = document.getElementById("whatif-subscore-after-bar");
    beforeBar.style.width = "0%";
    afterBar.style.width = "0%";

    whatifBackdrop.classList.remove("hidden");
    void whatifBackdrop.offsetWidth;
    setTimeout(function () {
      whatifBackdrop.classList.add("is-open");
      whatifDrawer.classList.add("is-open");
      whatifDrawer.setAttribute("aria-hidden", "false");
    }, 20);

    setTimeout(function () {
      beforeBar.style.width = (impact.from || 0) + "%";
      afterBar.style.width = (impact.to || 0) + "%";
    }, 350);

    refreshIcons();
  }

  function closeWhatIfDrawer() {
    whatifBackdrop.classList.remove("is-open");
    whatifDrawer.classList.remove("is-open");
    whatifDrawer.setAttribute("aria-hidden", "true");
    setTimeout(function () { whatifBackdrop.classList.add("hidden"); }, 400);
  }

  // ---------- AI Inspector (prompt / raw schema / metadata) ----------
  function syntaxHighlightJSON(json) {
    // Run the tokenizer on the raw JSON first (regex needs real quote chars),
    // then escape only inside each matched token — structural JSON punctuation
    // (braces, commas, colons, whitespace) never contains <, >, or & anyway.
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      function (match) {
        var cls = "tok-number";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "tok-key" : "tok-string";
        } else if (/true|false/.test(match)) {
          cls = "tok-bool";
        } else if (/null/.test(match)) {
          cls = "tok-punct";
        }
        return '<span class="' + cls + '">' + escapeHTML(match) + "</span>";
      }
    );
  }

  function renderInspector(data) {
    document.getElementById("inspector-prompt").textContent = SYSTEM_PROMPT;
    document.getElementById("inspector-schema").innerHTML = syntaxHighlightJSON(JSON.stringify(data, null, 2));

    var meta = data.aiMetadata || {};
    var metaEl = document.getElementById("inspector-meta");
    var fields = [
      ["Model", meta.modelId || "—"],
      ["Confidence", typeof meta.confidence === "number" ? Math.round(meta.confidence * 100) + "%" : "—"],
      ["Latency", typeof meta.processingLatencyMs === "number" ? meta.processingLatencyMs + " ms" : "—"]
    ];
    metaEl.innerHTML = fields.map(function (f) {
      return '<div class="inspector-meta-item"><span class="label">' + f[0] + '</span><span class="value">' + escapeHTML(String(f[1])) + "</span></div>";
    }).join("");
  }

  // ---------- Live Vision API (optional, client-side, key kept in memory only) ----------
  var analysisMode = "demo";
  var liveApiKey = "";
  var VISION_MODEL = "claude-sonnet-5";

  function buildVisionPrompt() {
    return (
      SYSTEM_PROMPT +
      "\n\nRespond with ONLY the JSON object — matching this exact shape:\n" +
      JSON.stringify({
        receiptLabel: "string",
        receiptSubtitle: "string",
        extractedItems: [{ name: "string", category: "string", estimatedPrice: 0 }],
        purchaseIQ: {
          total: 0,
          subScores: {
            spendingEfficiency: { score: 0, rationale: "string" },
            wellness: { score: 0, rationale: "string" },
            sustainability: { score: 0, rationale: "string" },
            wasteEfficiency: { score: 0, rationale: "string" }
          }
        },
        spendingInsights: ["string"],
        wellnessInsights: ["string"],
        sustainabilityInsights: { packagingImpact: "Low|Moderate|High", singleUsePlastic: "Low|Moderate|High", localPurchasingEstimate: "Low|Moderate|High", wasteGeneration: "Low|Moderate|High", reasoning: "string" },
        recommendations: [{ category: "Financial|Sustainability|Wellness", text: "string", rationale: "string" }]
      }, null, 2)
    );
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result || "";
        var commaIdx = result.indexOf(",");
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = function () { reject(new Error("Could not read file")); };
      reader.readAsDataURL(file);
    });
  }

  function analyzeWithLiveVision(file) {
    if (!liveApiKey) {
      return Promise.reject(new Error("No API key provided"));
    }
    return fileToBase64(file).then(function (base64) {
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": liveApiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: buildVisionPrompt() }
            ]
          }]
        })
      });
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error("API error " + res.status + ": " + t.slice(0, 200)); });
      return res.json();
    }).then(function (json) {
      var text = json.content && json.content[0] && json.content[0].text;
      if (!text) throw new Error("Empty response from model");
      var cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      var parsed = JSON.parse(cleaned);
      if (!parsed.purchaseIQ || typeof parsed.purchaseIQ.total !== "number") {
        throw new Error("Response did not match the expected schema");
      }
      parsed.aiMetadata = { modelId: VISION_MODEL, confidence: null, processingLatencyMs: null };
      return parsed;
    });
  }

  // ---------- Event wiring ----------
  document.getElementById("cta-analyze").addEventListener("click", function () {
    showView("upload");
    renderSampleCards();
  });
  document.querySelectorAll(".cta-analyze-secondary").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showView("upload");
      renderSampleCards();
    });
  });

  document.getElementById("logo-home").addEventListener("click", function () {
    showView("landing");
  });

  document.getElementById("analyze-another").addEventListener("click", function () {
    showView("upload");
    hideUploadNotice();
    renderSampleCards();
  });

  // Dropzone — behavior branches on Demo vs Live mode (see mode toggle below)
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");

  dropzone.addEventListener("click", function () {
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files.length) handleUploadedFile(fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    });
  });
  dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleUploadedFile(e.dataTransfer.files[0]);
  });

  function handleUploadedFile(file) {
    if (analysisMode === "demo") {
      showUploadNotice(
        "You're in Demo Mode, so live analysis is off. Switch to “Live Claude Vision” above to analyze your own photo, or try a sample receipt below."
      );
      return;
    }

    // Live mode
    if (!file.type || file.type.indexOf("image/") !== 0) {
      showUploadNotice("Live Vision mode needs an image file (JPG or PNG). Try again, or switch to Demo Mode.");
      return;
    }
    if (!liveApiKey) {
      showUploadNotice("Enter your Anthropic API key above to use Live Claude Vision, or switch back to Demo Mode.");
      return;
    }

    hideUploadNotice();
    showView("processing");
    runProcessingSequence();
    var startedAt = Date.now();

    analyzeWithLiveVision(file)
      .then(function (data) {
        data.aiMetadata.processingLatencyMs = Date.now() - startedAt;
        waitForProcessing().then(function () {
          renderReport(data);
          showView("report");
        });
      })
      .catch(function (err) {
        waitForProcessing().then(function () {
          showView("upload");
          showUploadNotice(
            "Live analysis couldn't complete (" + (err && err.message ? err.message : "unknown error") +
            "). Showing the sample experience instead is your best bet — pick a sample receipt below."
          );
        });
      });
  }

  // ---------- Mode toggle (Demo / Live Vision) ----------
  var modeBtnDemo = document.getElementById("mode-btn-demo");
  var modeBtnLive = document.getElementById("mode-btn-live");
  var liveKeyPanel = document.getElementById("live-key-panel");
  var liveApiKeyInput = document.getElementById("live-api-key");
  var dropzoneTitle = document.getElementById("dropzone-title");
  var dropzoneSubtitle = document.getElementById("dropzone-subtitle");

  function setMode(mode) {
    analysisMode = mode;
    modeBtnDemo.classList.toggle("is-active", mode === "demo");
    modeBtnLive.classList.toggle("is-active", mode === "live");
    liveKeyPanel.classList.toggle("hidden", mode !== "live");
    hideUploadNotice();
    if (mode === "live") {
      dropzoneTitle.textContent = "Drag & drop your receipt photo";
      dropzoneSubtitle.textContent = "Sent directly to Claude Vision from your browser";
    } else {
      dropzoneTitle.textContent = "Drag & drop a receipt image";
      dropzoneSubtitle.textContent = "or click to browse · JPG, PNG";
    }
  }
  modeBtnDemo.addEventListener("click", function () { setMode("demo"); });
  modeBtnLive.addEventListener("click", function () { setMode("live"); });
  liveApiKeyInput.addEventListener("input", function () {
    liveApiKey = liveApiKeyInput.value.trim();
  });

  // ---------- What If drawer wiring ----------
  document.getElementById("whatif-close").addEventListener("click", closeWhatIfDrawer);
  whatifBackdrop.addEventListener("click", closeWhatIfDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeWhatIfDrawer();
  });

  // ---------- Clear filter wiring ----------
  document.getElementById("clear-filter-btn").addEventListener("click", clearFilter);

  // ---------- Apply Eco-Swaps wiring ----------
  document.getElementById("apply-eco-swaps-btn").addEventListener("click", function () {
    if (currentReportData) toggleEcoSwapPreview(currentReportData);
  });

  // ---------- Inspector accordion wiring ----------
  var inspectorToggle = document.getElementById("inspector-toggle");
  var inspectorBody = document.getElementById("inspector-body");
  inspectorToggle.addEventListener("click", function () {
    var isOpen = inspectorBody.classList.toggle("is-open");
    inspectorToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  // ---------- Init ----------
  refreshIcons();
  showView("landing");
})();
