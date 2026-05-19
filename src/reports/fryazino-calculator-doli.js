/**
 * Калькулятор доходности проекта Фрязино (доли, склад №3)
 * Логика соответствует Google Sheets «Фрязино - калькулятор доходности - доли»
 */

const WAREHOUSE_AREA = 1257.1;

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

const EXPECTED_SALE_DIAGONAL = { 110000: 3, 105000: 2, 100000: 1, 95000: 0 };
const EXPECTED_RENT_RATE = 700;

function fmtNum(n) {
  if (n == null || isNaN(n) || !Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function fmtPct(n) {
  if (n == null || isNaN(n) || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(2).replace(".", ",") + "%";
}

function yieldToBgColor(y) {
  if (y == null || isNaN(y) || !Number.isFinite(y)) return "transparent";
  const t = Math.max(0, Math.min(1, y / 0.2));
  const r = Math.round(254 - t * 34);
  const g = Math.round(226 + t * 26);
  const b = Math.round(226 + t * 5);
  return `rgb(${r}, ${g}, ${b})`;
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

  const rentIndexation = parseFloat(document.getElementById("rentIndexation").value) / 100;
  const rentVacation = parseFloat(document.getElementById("rentVacation").value);

  const scenarios = ["A", "B", "C", "D"].map((k) => ({
    months: parseFloat(document.getElementById(`scenario-months-${k}`).value) || 0,
    price: parseFloat(document.getElementById(`scenario-price-${k}`).value) || 0,
    rent: parseFloat(document.getElementById(`scenario-rent-${k}`).value) || 0,
  }));

  return {
    sharePct,
    purchaseCost,
    purchaseDate: document.getElementById("purchaseDate").value,
    shareSqm,
    pricePerSqm,
    ownershipMonths,
    rentIndexation,
    rentVacation,
    scenarios,
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

function render(state) {
  document.getElementById("out-shareSqm").textContent = fmtNum(state.shareSqm);
  document.getElementById("out-pricePerSqm").textContent = fmtNum(state.pricePerSqm);
  document.getElementById("out-ownershipMonths").textContent = state.ownershipMonths.toFixed(2);

  const saleTbody = document.querySelector("#table-sale-income tbody");
  saleTbody.innerHTML = SALE_PRICES.map((price) => {
    const income = calcSaleIncome(state.pricePerSqm, price, state.shareSqm);
    const expectedColIdx = EXPECTED_SALE_DIAGONAL[price];
    const cells = SALE_PERIODS.map((_, colIdx) => {
      const isExpected = expectedColIdx === colIdx;
      const cls = isExpected ? "bg-blue-100 text-blue-800 font-medium" : "";
      return `<td class="${cls}">${fmtNum(income)}</td>`;
    }).join("");
    return `<tr><td>${fmtNum(price)}</td>${cells}</tr>`;
  }).join("");

  const rentTbody = document.querySelector("#table-rent-income tbody");
  rentTbody.innerHTML = RENT_RATES.map((rate) => {
    const net = getNetRent(rate);
    const isExpected = rate === EXPECTED_RENT_RATE;
    const cls = isExpected ? "bg-blue-100 text-blue-800 font-medium" : "";
    const cells = SALE_PERIODS.map((m) => {
      const inc = calcRentIncomeCumulative(
        net,
        state.shareSqm,
        m,
        state.rentVacation,
        state.rentIndexation
      );
      return `<td class="${cls}">${fmtNum(inc)}</td>`;
    }).join("");
    return `<tr><td class="${cls}">${fmtNum(rate)}</td>${cells}</tr>`;
  }).join("");

  const getRentForScenario = (months, rentRate) => {
    if (months <= 0) return 0;
    const net = getNetRent(rentRate);
    return calcRentIncomeCumulative(
      net,
      state.shareSqm,
      months,
      state.rentVacation,
      state.rentIndexation
    );
  };

  const getSaleForScenario = (price) =>
    calcSaleIncome(state.pricePerSqm, price, state.shareSqm);

  state.scenarios.forEach((s, i) => {
    const k = ["A", "B", "C", "D"][i];
    const rentIncome = getRentForScenario(s.months, s.rent);
    const saleIncome = getSaleForScenario(s.price);
    const totalMonths = state.ownershipMonths + s.months;
    const totalIncome = rentIncome + saleIncome;

    document.getElementById(`out-rent-${k}`).textContent = fmtNum(rentIncome);
    document.getElementById(`out-sale-${k}`).textContent = fmtNum(saleIncome);
    document.getElementById(`out-total-months-${k}`).textContent = totalMonths.toFixed(2);

    const yRentNpv = calcYieldNPV(rentIncome, s.months, state.purchaseCost, totalMonths);
    const ySaleNpv = calcYieldSimple(saleIncome, state.purchaseCost, totalMonths);
    const yTotalNpv =
      yRentNpv != null && ySaleNpv != null ? yRentNpv + ySaleNpv : null;
    const ySimple = calcYieldSimple(totalIncome, state.purchaseCost, totalMonths);

    const rentNpvEl = document.getElementById(`out-yield-rent-npv-${k}`);
    const saleNpvEl = document.getElementById(`out-yield-sale-npv-${k}`);
    const totalNpvEl = document.getElementById(`out-yield-total-npv-${k}`);
    const simpleEl = document.getElementById(`out-yield-simple-${k}`);

    rentNpvEl.textContent = fmtPct(yRentNpv);
    saleNpvEl.textContent = fmtPct(ySaleNpv);
    totalNpvEl.textContent = fmtPct(yTotalNpv);
    simpleEl.textContent = fmtPct(ySimple);

    [rentNpvEl, saleNpvEl, totalNpvEl, simpleEl].forEach((el, idx) => {
      const y = [yRentNpv, ySaleNpv, yTotalNpv, ySimple][idx];
      el.style.backgroundColor = yieldToBgColor(y);
    });
  });
}

function init() {
  const update = () => render(getState());

  const inputs = document.querySelectorAll(
    "#sharePct, #purchaseCost, #purchaseDate, #rentIndexation, #rentVacation, " +
      "[id^='scenario-']"
  );
  inputs.forEach((el) => {
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  update();
}

init();
