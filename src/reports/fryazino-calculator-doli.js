/**
 * Калькулятор доходности проекта Фрязино (доли, склад №3)
 * Логика соответствует Google Sheets «Фрязино - калькулятор доходности - доли»
 */

const WAREHOUSE_AREA = 1257.1;
const RENT_INDEXATION = 0.07;
const RENT_VACATION = 2;

const NET_RENT_BY_RATE = {
  600: 513,
  700: 598.5,
  800: 684,
  900: 769.5,
  1000: 855,
};

const SALE_PRICES = [110000, 105000, 100000, 95000, 90000, 85000];
const RENT_RATES = [1000, 900, 800, 700, 600];
const SALE_PERIODS = [12, 24, 36, 48];

const EXPECTED_RENT_RATE = 700;

const PICKER_MONTHS_MIN = 6;
const PICKER_MONTHS_MAX = 60;
const PICKER_PRICE_MIN = 70000;
const PICKER_PRICE_MAX = 130000;
const PICKER_PRICE_STEP = 2000;
const HEATMAP_MONTHS = PICKER_MONTHS_MAX - PICKER_MONTHS_MIN + 1;
const HEATMAP_PRICE_STEPS =
  Math.floor((PICKER_PRICE_MAX - PICKER_PRICE_MIN) / PICKER_PRICE_STEP) + 1;

const INITIATOR_PRICE_TREND = [
  { months: 12, price: 95000 },
  { months: 24, price: 100000 },
  { months: 36, price: 105000 },
  { months: 48, price: 110000 },
];
const INITIATOR_TREND_BAND = 10000;

const DEFAULT_PICKER = { months: 24, price: 100000 };

const PICKER_PAD_LEFT = 56;
const PICKER_PAD_TOP = 14;
const PICKER_PAD_BOTTOM = 48;
const PICKER_YEAR_TICKS = [24, 36, 48, 60];
const PICKER_YEAR_LABELS = ["2 г.", "3 г.", "4 г.", "5 г."];
const PICKER_AXIS_LABEL_NEAR = 16;
const PICKER_PRICE_UNIT_LABEL = "₽/кв.\u00a0м";
const PICKER_HEATMAP_COLOR_MAX = 0.4;

/** Палитра website/DESIGN.md (primary, warm neutrals) */
const DESIGN_PRIMARY = "#a83900";
const DESIGN_ON_SURFACE = "#1a1c1c";
const DESIGN_AXIS_MUTED = "rgba(86, 67, 55, 0.55)";
const DESIGN_SURFACE_LOW = "#f4f3f2";
const DESIGN_BRAND_RGB = "168, 57, 0";

const INPUT_SELECTOR = "#sharePct, #purchaseCost";

/** Ключи query string для шаринга расчёта */
const URL_KEYS = {
  date: "data",
  share: "dolya",
  cost: "summa",
  price: "cena",
  months: "srok",
};

const pickerState = {
  selected: { ...DEFAULT_PICKER },
  heatmap: null,
  canvasSize: 0,
  dragging: false,
};

function fmtNum(n) {
  if (n == null || isNaN(n) || !Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function fmtPct(n) {
  if (n == null || isNaN(n) || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(2).replace(".", ",") + "%";
}

function fmtMillionsRub(income) {
  if (income == null || isNaN(income) || !Number.isFinite(income)) return "—";
  const num = (income / 1e6).toFixed(2).replace(".", ",");
  return `${num}\u00A0млн\u00A0₽`;
}

function fmtYieldWithIncomeHtml(y, income) {
  const pct = fmtPct(y);
  const mln = fmtMillionsRub(income);
  return `<span class="scenario-metrics-yield-line"><span class="scenario-metrics-yield-head"><span class="scenario-metrics-pct">${pct}</span> /</span><span class="scenario-metrics-income">${mln}</span></span>`;
}

const PICKER_HEATMAP_RGB_LOW = [244, 243, 242];
const PICKER_HEATMAP_RGB_MID = [232, 240, 250];
const PICKER_HEATMAP_RGB_HIGH = [200, 230, 212];

function lerpHeatmapRgb(a, b, u) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

function yieldToBgColor(y, maxY = PICKER_HEATMAP_COLOR_MAX) {
  if (y == null || isNaN(y) || !Number.isFinite(y)) return "transparent";
  const t = Math.max(0, Math.min(1, y / maxY));
  const rgb =
    t <= 0.5
      ? lerpHeatmapRgb(PICKER_HEATMAP_RGB_LOW, PICKER_HEATMAP_RGB_MID, t * 2)
      : lerpHeatmapRgb(
        PICKER_HEATMAP_RGB_MID,
        PICKER_HEATMAP_RGB_HIGH,
        (t - 0.5) * 2
      );
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function yieldToFillStyle(y, maxY = PICKER_HEATMAP_COLOR_MAX) {
  const bg = yieldToBgColor(y, maxY);
  return bg === "transparent" ? DESIGN_SURFACE_LOW : bg;
}

function getNetRent(rate) {
  const r = Number(rate);
  if (NET_RENT_BY_RATE[r] != null) return NET_RENT_BY_RATE[r];
  const sorted = Object.keys(NET_RENT_BY_RATE).map(Number).sort((a, b) => a - b);
  const lo = sorted.filter((k) => k <= r).pop();
  const hi = sorted.find((k) => k >= r);
  if (lo == null) return NET_RENT_BY_RATE[hi];
  if (hi == null) return NET_RENT_BY_RATE[lo];
  const t = (r - lo) / (hi - lo);
  return NET_RENT_BY_RATE[lo] + t * (NET_RENT_BY_RATE[hi] - NET_RENT_BY_RATE[lo]);
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseSharePctInput() {
  const raw = parseFloat(document.getElementById("sharePct").value);
  if (!Number.isFinite(raw) || raw <= 0) return 0.05;
  return Math.min(100, Math.max(0.1, raw)) / 100;
}

function parsePurchaseCostInput() {
  const raw = parseFloat(document.getElementById("purchaseCost").value);
  if (!Number.isFinite(raw) || raw <= 0) return 5_330_000;
  return raw;
}

function getState() {
  const sharePct = parseSharePctInput();
  const purchaseCost = parsePurchaseCostInput();
  const shareSqm = WAREHOUSE_AREA * sharePct;
  const pricePerSqm = shareSqm > 0 ? purchaseCost / shareSqm : 0;
  // Дата покупки в расчётах всегда «сегодня» — срок владения до продажи = срок на графике
  const ownershipMonths = 0;

  return {
    sharePct,
    purchaseCost,
    purchaseDate: todayIsoDate(),
    shareSqm,
    pricePerSqm,
    ownershipMonths,
  };
}

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);

  const shareRaw = params.get(URL_KEYS.share);
  if (shareRaw != null && shareRaw !== "") {
    const share = parseFloat(String(shareRaw).replace(",", "."));
    if (Number.isFinite(share) && share > 0 && share <= 100) {
      document.getElementById("sharePct").value = String(share);
    }
  }

  const costRaw = params.get(URL_KEYS.cost);
  if (costRaw != null && costRaw !== "") {
    const cost = parseFloat(String(costRaw).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(cost) && cost > 0) {
      document.getElementById("purchaseCost").value = String(Math.round(cost));
    }
  }

  const priceRaw = params.get(URL_KEYS.price);
  const monthsRaw = params.get(URL_KEYS.months);
  let picker = { ...DEFAULT_PICKER };
  if (priceRaw != null && priceRaw !== "") {
    const price = parseFloat(String(priceRaw).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(price)) picker.price = price;
  }
  if (monthsRaw != null && monthsRaw !== "") {
    const months = parseFloat(String(monthsRaw).replace(",", "."));
    if (Number.isFinite(months)) picker.months = months;
  }
  pickerState.selected = clampPicker(picker.months, picker.price);
}

function syncUrlFromState(state) {
  const params = new URLSearchParams();
  const sharePct = state.sharePct * 100;
  if (Number.isFinite(sharePct)) {
    params.set(URL_KEYS.share, String(Number(sharePct.toFixed(1))));
  }
  if (Number.isFinite(state.purchaseCost) && state.purchaseCost > 0) {
    params.set(URL_KEYS.cost, String(Math.round(state.purchaseCost)));
  }
  params.set(URL_KEYS.date, state.purchaseDate);
  const { months, price } = pickerState.selected;
  params.set(URL_KEYS.months, String(months));
  params.set(URL_KEYS.price, String(price));

  const query = params.toString();
  const next = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState(null, "", next);
  }
}

function calcSaleIncome(pricePerSqm, salePricePerSqm, shareSqm) {
  return (salePricePerSqm - pricePerSqm) * shareSqm;
}

function calcRentIncomeCumulative(netPerSqm, shareSqm, monthsToRent, vacation, indexation) {
  if (monthsToRent <= 0) return 0;
  let total = 0;
  const firstYearMonths = Math.min(12, monthsToRent);
  const firstYearRentMonths = Math.max(0, firstYearMonths - vacation);
  total += netPerSqm * firstYearRentMonths * shareSqm;

  let remaining = monthsToRent - 12;
  const year2PlusRate = 1 + indexation;
  while (remaining > 0) {
    const segment = Math.min(12, remaining);
    total += netPerSqm * segment * year2PlusRate * shareSqm;
    remaining -= 12;
  }
  return total;
}

function calcYieldNPV(income, monthsToSale, purchaseCost, totalOwnershipMonths) {
  if (monthsToSale <= 0 || totalOwnershipMonths <= 0 || income <= 0) return null;
  const growth = income / purchaseCost / monthsToSale;
  const factor = Math.pow(1 + growth, monthsToSale) - 1;
  return (factor / totalOwnershipMonths) * 12;
}

function calcYieldSimple(totalIncome, purchaseCost, totalOwnershipMonths) {
  if (totalOwnershipMonths <= 0) return null;
  return (totalIncome / purchaseCost / totalOwnershipMonths) * 12;
}

function getRentForScenario(months, shareSqm) {
  if (months <= 0) return 0;
  const net = getNetRent(EXPECTED_RENT_RATE);
  return calcRentIncomeCumulative(
    net,
    shareSqm,
    months,
    RENT_VACATION,
    RENT_INDEXATION
  );
}

function calcScenarioMetrics(state, monthsToSale, salePricePerSqm) {
  const rentIncome = getRentForScenario(monthsToSale, state.shareSqm);
  const saleIncome = calcSaleIncome(state.pricePerSqm, salePricePerSqm, state.shareSqm);
  const totalMonths = state.ownershipMonths + monthsToSale;
  const yRentNpv = calcYieldNPV(rentIncome, monthsToSale, state.purchaseCost, totalMonths);
  const ySaleNpv = calcYieldSimple(saleIncome, state.purchaseCost, totalMonths);
  const yTotalNpv =
    yRentNpv != null || ySaleNpv != null
      ? (yRentNpv ?? 0) + (ySaleNpv ?? 0)
      : null;
  const totalIncome = rentIncome + saleIncome;

  return {
    rentIncome,
    saleIncome,
    totalIncome,
    totalMonths,
    yRentNpv,
    ySaleNpv,
    yTotalNpv,
  };
}

function clampPicker(months, price) {
  const m = Math.round(
    Math.max(PICKER_MONTHS_MIN, Math.min(PICKER_MONTHS_MAX, months))
  );
  const p = Math.round(
    Math.max(PICKER_PRICE_MIN, Math.min(PICKER_PRICE_MAX, price)) / 1000
  ) * 1000;
  return { months: m, price: p };
}

function getPlotLayout(size) {
  return {
    plotX: PICKER_PAD_LEFT,
    plotY: PICKER_PAD_TOP,
    plotW: size - PICKER_PAD_LEFT,
    plotH: size - PICKER_PAD_TOP - PICKER_PAD_BOTTOM,
  };
}

function monthsToPlotX(months, layout) {
  const t =
    (months - PICKER_MONTHS_MIN) / (PICKER_MONTHS_MAX - PICKER_MONTHS_MIN);
  return layout.plotX + t * layout.plotW;
}

function priceToPlotY(price, layout) {
  const t = (PICKER_PRICE_MAX - price) / (PICKER_PRICE_MAX - PICKER_PRICE_MIN);
  return layout.plotY + t * layout.plotH;
}

function formatMonthsAxisLabel(months) {
  if (months === 0) return "0";
  if (months > 0 && months % 12 === 0) return `${months / 12} г.`;
  return `${months} мес.`;
}

function nearestYearTickIndex(months) {
  let bestIdx = 0;
  let bestDist = Infinity;
  PICKER_YEAR_TICKS.forEach((m, i) => {
    const d = Math.abs(m - months);
    if (d < bestDist || (d === bestDist && m > PICKER_YEAR_TICKS[bestIdx])) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function priceOnInitiatorTrend(months) {
  const first = INITIATOR_PRICE_TREND[0];
  const last = INITIATOR_PRICE_TREND[INITIATOR_PRICE_TREND.length - 1];
  const slope = (last.price - first.price) / (last.months - first.months);
  return first.price + slope * (months - first.months);
}

function drawInitiatorTrend(ctx, layout) {
  const m0 = PICKER_MONTHS_MIN;
  const m1 = PICKER_MONTHS_MAX;
  const mid0 = priceOnInitiatorTrend(m0);
  const mid1 = priceOnInitiatorTrend(m1);
  const x0 = monthsToPlotX(m0, layout);
  const x1 = monthsToPlotX(m1, layout);
  const yMid0 = priceToPlotY(mid0, layout);
  const yMid1 = priceToPlotY(mid1, layout);
  const yHigh0 = priceToPlotY(
    Math.min(PICKER_PRICE_MAX, mid0 + INITIATOR_TREND_BAND),
    layout
  );
  const yHigh1 = priceToPlotY(
    Math.min(PICKER_PRICE_MAX, mid1 + INITIATOR_TREND_BAND),
    layout
  );
  const yLow0 = priceToPlotY(
    Math.max(PICKER_PRICE_MIN, mid0 - INITIATOR_TREND_BAND),
    layout
  );
  const yLow1 = priceToPlotY(
    Math.max(PICKER_PRICE_MIN, mid1 - INITIATOR_TREND_BAND),
    layout
  );

  ctx.fillStyle = `rgba(${DESIGN_BRAND_RGB}, 0.10)`;
  ctx.beginPath();
  ctx.moveTo(x0, yHigh0);
  ctx.lineTo(x1, yHigh1);
  ctx.lineTo(x1, yLow1);
  ctx.lineTo(x0, yLow0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(${DESIGN_BRAND_RGB}, 0.45)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, yMid0);
  ctx.lineTo(x1, yMid1);
  ctx.stroke();
}

function drawPickerLabelBg(ctx, text, x, y, align) {
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  const w = ctx.measureText(text).width;
  const pad = 3;
  const h = 14;
  let left;
  if (align === "right") {
    left = x - w - pad;
  } else {
    left = x - w / 2 - pad;
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(left, y - h / 2, w + pad * 2, h);
  ctx.fillStyle = DESIGN_PRIMARY;
  ctx.fillText(text, x, y);
}

function drawYAxisRayPriceLabel(ctx, price, y, layout) {
  const anchorRight = layout.plotX - 6;
  const priceText = fmtNum(price);
  const pad = 3;
  const priceLineH = 14;
  const unitLineH = 12;
  const lineGap = 1;

  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  const priceW = ctx.measureText(priceText).width;
  ctx.font = "10px Inter, system-ui, sans-serif";
  const unitW = ctx.measureText(PICKER_PRICE_UNIT_LABEL).width;
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  const minPriceW = ctx.measureText(fmtNum(PICKER_PRICE_MAX)).width;
  const blockW = Math.max(priceW, unitW, minPriceW) + pad * 2;
  const blockH = priceLineH + lineGap + unitLineH;
  const left = anchorRight - blockW;
  const top = y - blockH / 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(left, top, blockW, blockH);

  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = DESIGN_PRIMARY;
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.fillText(priceText, anchorRight - pad, top + 2);
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillText(PICKER_PRICE_UNIT_LABEL, anchorRight - pad, top + 2 + priceLineH + lineGap);
}

function canvasToPicker(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  const layout = getPlotLayout(pickerState.canvasSize);
  const x = clientX - rect.left - layout.plotX;
  const y = clientY - rect.top - layout.plotY;
  if (x < 0 || y < 0 || x > layout.plotW || y > layout.plotH) {
    return pickerState.selected;
  }
  const months =
    (x / layout.plotW) * (PICKER_MONTHS_MAX - PICKER_MONTHS_MIN) + PICKER_MONTHS_MIN;
  const price =
    PICKER_PRICE_MAX - (y / layout.plotH) * (PICKER_PRICE_MAX - PICKER_PRICE_MIN);
  return clampPicker(months, price);
}

function buildHeatmap(state) {
  const grid = [];
  for (let mi = 0; mi < HEATMAP_MONTHS; mi++) {
    const row = [];
    const months = PICKER_MONTHS_MIN + mi;
    for (let pi = 0; pi < HEATMAP_PRICE_STEPS; pi++) {
      const price = PICKER_PRICE_MIN + pi * PICKER_PRICE_STEP;
      const { yTotalNpv } = calcScenarioMetrics(state, months, price);
      row.push(yTotalNpv);
    }
    grid.push(row);
  }
  return grid;
}

function resizePickerCanvas(canvas) {
  const wrap = canvas.parentElement;
  if (!wrap) return 0;
  const size = Math.min(wrap.clientWidth || 320, 480);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  pickerState.canvasSize = size;
  return size;
}

function drawPicker(canvas, state) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const size = pickerState.canvasSize;
  const layout = getPlotLayout(size);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cellW = layout.plotW / HEATMAP_MONTHS;
  const cellH = layout.plotH / HEATMAP_PRICE_STEPS;
  const heatmap = pickerState.heatmap;

  for (let mi = 0; mi < HEATMAP_MONTHS; mi++) {
    for (let pi = 0; pi < HEATMAP_PRICE_STEPS; pi++) {
      const piDraw = HEATMAP_PRICE_STEPS - 1 - pi;
      ctx.fillStyle = yieldToFillStyle(heatmap[mi][pi]);
      ctx.fillRect(
        layout.plotX + mi * cellW,
        layout.plotY + piDraw * cellH,
        cellW + 0.5,
        cellH + 0.5
      );
    }
  }

  drawInitiatorTrend(ctx, layout);

  const axisBottom = layout.plotY + layout.plotH;
  const yearLabelY = axisBottom + 8;
  const { months, price } = pickerState.selected;
  const onYearTick = PICKER_YEAR_TICKS.includes(months);
  const atMinMonths = months === PICKER_MONTHS_MIN;
  const hideYearIdx = onYearTick || atMinMonths ? -1 : nearestYearTickIndex(months);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = atMinMonths ? DESIGN_PRIMARY : DESIGN_AXIS_MUTED;
  ctx.font = atMinMonths
    ? "bold 11px Inter, system-ui, sans-serif"
    : "10px Inter, system-ui, sans-serif";
  ctx.fillText(
    formatMonthsAxisLabel(PICKER_MONTHS_MIN),
    layout.plotX,
    yearLabelY
  );

  PICKER_YEAR_TICKS.forEach((m, i) => {
    if (!onYearTick && !atMinMonths && i === hideYearIdx) return;
    const x = monthsToPlotX(m, layout);
    const isSel = onYearTick && months === m;
    const last = i === PICKER_YEAR_TICKS.length - 1;
    ctx.textAlign = last ? "right" : "center";
    const labelX = last ? layout.plotX + layout.plotW : x;
    ctx.fillStyle = isSel ? DESIGN_PRIMARY : DESIGN_AXIS_MUTED;
    ctx.font = isSel
      ? "bold 11px Inter, system-ui, sans-serif"
      : "10px Inter, system-ui, sans-serif";
    ctx.fillText(
      isSel ? formatMonthsAxisLabel(months) : PICKER_YEAR_LABELS[i],
      labelX,
      yearLabelY
    );
  });
  ctx.textAlign = "center";

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  if (Math.abs(price - PICKER_PRICE_MAX) > PICKER_AXIS_LABEL_NEAR) {
    ctx.fillStyle = DESIGN_AXIS_MUTED;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText("130 тыс.", layout.plotX - 6, layout.plotY + 2);
  }
  if (Math.abs(price - PICKER_PRICE_MIN) > PICKER_AXIS_LABEL_NEAR) {
    ctx.fillStyle = DESIGN_AXIS_MUTED;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText("70 тыс.", layout.plotX - 6, axisBottom - 4);
  }

  const sx = monthsToPlotX(months, layout);
  const sy = priceToPlotY(price, layout);
  const { yTotalNpv } = calcScenarioMetrics(state, months, price);
  const markerFill = yieldToFillStyle(yTotalNpv);

  ctx.strokeStyle = `rgba(${DESIGN_BRAND_RGB}, 0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, axisBottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, axisBottom);
  ctx.lineTo(sx, axisBottom + 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(layout.plotX, sy);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  if (!onYearTick && !atMinMonths) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawPickerLabelBg(
      ctx,
      formatMonthsAxisLabel(months),
      sx,
      yearLabelY + 7,
      "center"
    );
  }

  drawYAxisRayPriceLabel(ctx, price, sy, layout);

  ctx.beginPath();
  ctx.arc(sx, sy, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = DESIGN_PRIMARY;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fillStyle = markerFill;
  ctx.fill();
}

function updateMetricsPanel(metrics) {
  const { months, price } = pickerState.selected;
  document.getElementById("out-picker-term").textContent =
    formatMonthsAxisLabel(months);
  document.getElementById("out-picker-price").textContent =
    `${fmtNum(price)} ₽/кв.м`;

  document.getElementById("out-picker-rent").innerHTML = fmtYieldWithIncomeHtml(
    metrics.yRentNpv,
    metrics.rentIncome
  );
  document.getElementById("out-picker-sale").innerHTML = fmtYieldWithIncomeHtml(
    metrics.ySaleNpv,
    metrics.saleIncome
  );
  document.getElementById("out-picker-yield-total").innerHTML =
    fmtYieldWithIncomeHtml(metrics.yTotalNpv, metrics.totalIncome);
}

function selectPoint(state, months, price) {
  pickerState.selected = clampPicker(months, price);
  const m = calcScenarioMetrics(state, pickerState.selected.months, pickerState.selected.price);
  updateMetricsPanel({
    months: pickerState.selected.months,
    price: pickerState.selected.price,
    ...m,
  });
  syncUrlFromState(state);
  const canvas = document.getElementById("scenario-picker-canvas");
  if (canvas) drawPicker(canvas, state);
}

function render(state) {
  document.getElementById("out-shareSqm").textContent = fmtNum(state.shareSqm);
  document.getElementById("out-pricePerSqm").textContent = fmtNum(state.pricePerSqm);
  syncUrlFromState(state);

  const saleTbody = document.querySelector("#table-sale-income tbody");
  saleTbody.innerHTML = SALE_PRICES.map((price) => {
    const income = calcSaleIncome(state.pricePerSqm, price, state.shareSqm);
    return `<tr><td>${fmtNum(price)}</td><td>${fmtNum(income)}</td></tr>`;
  }).join("");

  const rentTbody = document.querySelector("#table-rent-income tbody");
  rentTbody.innerHTML = RENT_RATES.map((rate) => {
    const net = getNetRent(rate);
    const isExpected = rate === EXPECTED_RENT_RATE;
    const cls = isExpected ? "calc-table-expected" : "";
    const cells = SALE_PERIODS.map((m) => {
      const inc = calcRentIncomeCumulative(
        net,
        state.shareSqm,
        m,
        RENT_VACATION,
        RENT_INDEXATION
      );
      return `<td class="${cls}">${fmtNum(inc)}</td>`;
    }).join("");
    return `<tr><td class="${cls}">${fmtNum(rate)}</td>${cells}</tr>`;
  }).join("");

  pickerState.heatmap = buildHeatmap(state);
  const canvas = document.getElementById("scenario-picker-canvas");
  if (canvas) {
    resizePickerCanvas(canvas);
    selectPoint(state, pickerState.selected.months, pickerState.selected.price);
  }
}

function initPicker() {
  const canvas = document.getElementById("scenario-picker-canvas");
  if (!canvas) return;

  const pickFromPointer = (clientX, clientY) => {
    const { months, price } = canvasToPicker(clientX, clientY, canvas);
    selectPoint(getState(), months, price);
  };

  canvas.addEventListener("pointerdown", (e) => {
    pickerState.dragging = true;
    canvas.setPointerCapture(e.pointerId);
    pickFromPointer(e.clientX, e.clientY);
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pickerState.dragging) return;
    pickFromPointer(e.clientX, e.clientY);
    e.preventDefault();
  });

  canvas.addEventListener("pointerup", (e) => {
    pickerState.dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointercancel", (e) => {
    pickerState.dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  });

  const ro = new ResizeObserver(() => {
    const s = getState();
    resizePickerCanvas(canvas);
    drawPicker(canvas, s);
  });
  ro.observe(canvas.parentElement);
}

function init() {
  readUrlParams();

  const update = () => render(getState());

  document.querySelectorAll(INPUT_SELECTOR).forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  initPicker();
  update();
}

init();
