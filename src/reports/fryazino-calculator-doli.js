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
const PICKER_YEAR_TICKS = [12, 24, 36, 48, 60];
const PICKER_YEAR_LABELS = ["1 г.", "2 г.", "3 г.", "4 г.", "5 г."];
const PICKER_AXIS_LABEL_NEAR = 16;
const PICKER_HEATMAP_COLOR_MAX = 0.4;

/** Палитра website/DESIGN.md (primary, warm neutrals) */
const DESIGN_PRIMARY = "#a83900";
const DESIGN_ON_SURFACE = "#1a1c1c";
const DESIGN_AXIS_MUTED = "rgba(86, 67, 55, 0.55)";
const DESIGN_SURFACE_LOW = "#f4f3f2";
const DESIGN_BRAND_RGB = "168, 57, 0";

const INPUT_SELECTOR = "#sharePct, #purchaseCost, #purchaseDate";

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

function yieldToBgColor(y, maxY = PICKER_HEATMAP_COLOR_MAX) {
  if (y == null || isNaN(y) || !Number.isFinite(y)) return "transparent";
  const t = Math.max(0, Math.min(1, y / maxY));
  const r = Math.round(254 - t * 34);
  const g = Math.round(226 + t * 26);
  const b = Math.round(226 + t * 5);
  return `rgb(${r}, ${g}, ${b})`;
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

function getState() {
  const sharePct = parseFloat(document.getElementById("sharePct").value) / 100;
  const purchaseCost = parseFloat(document.getElementById("purchaseCost").value);
  const purchaseDate = new Date(document.getElementById("purchaseDate").value);
  const shareSqm = WAREHOUSE_AREA * sharePct;
  const pricePerSqm = purchaseCost / shareSqm;
  const ownershipMonths =
    ((Date.now() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 12;

  return {
    sharePct,
    purchaseCost,
    purchaseDate: document.getElementById("purchaseDate").value,
    shareSqm,
    pricePerSqm,
    ownershipMonths,
  };
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
    yRentNpv != null && ySaleNpv != null ? yRentNpv + ySaleNpv : null;
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

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function priceOnInitiatorTrend(months) {
  const pts = INITIATOR_PRICE_TREND;
  if (months <= pts[0].months) {
    const [a, b] = pts;
    const slope = (b.price - a.price) / (b.months - a.months);
    return a.price + slope * (months - a.months);
  }
  const last = pts[pts.length - 1];
  if (months >= last.months) {
    const a = pts[pts.length - 2];
    const slope = (last.price - a.price) / (last.months - a.months);
    return last.price + slope * (months - last.months);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (months >= p1.months && months <= p2.months) {
      const p0 = pts[Math.max(0, i - 1)];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = (months - p1.months) / (p2.months - p1.months);
      return catmullRom(p0.price, p1.price, p2.price, p3.price, t);
    }
  }
  return pts[0].price;
}

function drawInitiatorTrend(ctx, layout) {
  const samples = [];
  for (let m = PICKER_MONTHS_MIN; m <= PICKER_MONTHS_MAX; m++) {
    const center = priceOnInitiatorTrend(m);
    const high = Math.min(PICKER_PRICE_MAX, center + INITIATOR_TREND_BAND);
    const low = Math.max(PICKER_PRICE_MIN, center - INITIATOR_TREND_BAND);
    samples.push({
      x: monthsToPlotX(m, layout),
      yHigh: priceToPlotY(high, layout),
      yLow: priceToPlotY(low, layout),
      yMid: priceToPlotY(center, layout),
    });
  }

  ctx.fillStyle = `rgba(${DESIGN_BRAND_RGB}, 0.12)`;
  ctx.beginPath();
  samples.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.yHigh);
    else ctx.lineTo(s.x, s.yHigh);
  });
  for (let i = samples.length - 1; i >= 0; i--) {
    ctx.lineTo(samples[i].x, samples[i].yLow);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(${DESIGN_BRAND_RGB}, 0.55)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.yMid);
    else ctx.lineTo(s.x, s.yMid);
  });
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
  const hideYearIdx = onYearTick ? -1 : nearestYearTickIndex(months);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  PICKER_YEAR_TICKS.forEach((m, i) => {
    if (!onYearTick && i === hideYearIdx) return;
    const x = monthsToPlotX(m, layout);
    const isSel = onYearTick && months === m;
    const last = i === PICKER_YEAR_TICKS.length - 1;
    ctx.textAlign = i === 0 ? "left" : last ? "right" : "center";
    const labelX =
      i === 0 ? layout.plotX : last ? layout.plotX + layout.plotW : x;
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

  ctx.strokeStyle = `rgba(${DESIGN_BRAND_RGB}, 0.45)`;
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

  if (!onYearTick) {
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

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  drawPickerLabelBg(ctx, fmtNum(price), layout.plotX - 8, sy, "right");

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
  const canvas = document.getElementById("scenario-picker-canvas");
  if (canvas) drawPicker(canvas, state);
}

function render(state) {
  document.getElementById("out-shareSqm").textContent = fmtNum(state.shareSqm);
  document.getElementById("out-pricePerSqm").textContent = fmtNum(state.pricePerSqm);
  document.getElementById("out-ownershipMonths").textContent = state.ownershipMonths.toFixed(2);

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

  canvas.addEventListener("pointercancel", () => {
    pickerState.dragging = false;
  });

  const ro = new ResizeObserver(() => {
    const s = getState();
    resizePickerCanvas(canvas);
    drawPicker(canvas, s);
  });
  ro.observe(canvas.parentElement);
}

function init() {
  const update = () => render(getState());

  document.querySelectorAll(INPUT_SELECTOR).forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  initPicker();
  update();
}

init();
