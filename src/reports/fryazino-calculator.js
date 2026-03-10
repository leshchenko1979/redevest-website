/**
 * Калькулятор доходности проекта Фрязино
 * Логика соответствует Excel-файлу "Фрязино - калькулятор доходности.xlsx"
 */

import * as XLSX from "xlsx";

const WAREHOUSE_AREAS = { 1: 1000, 2: 1246, 3: 1246 };

// Чистый арендный доход к инвестору (руб/кв.м/мес) по валовой ставке. Источник: лист "Аренда - подробности"
const NET_RENT_BY_RATE = {
  600: 513,
  700: 598.5,
  800: 684,
  900: 769.5,
  1000: 855,
};

const SALE_PRICES = [110000, 105000, 100000, 95000, 90000, 85000, 80000];
const RENT_RATES = [1000, 900, 800, 700, 600];
const SALE_PERIODS = [0, 12, 24, 36, 48];

// Ожидаемые инициатором: диагональ цена→срок (как в Excel)
const EXPECTED_SALE_DIAGONAL = { 110000: 4, 105000: 3, 100000: 2, 95000: 1, 80000: 0 };
const EXPECTED_RENT_RATE = 900;

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

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const warehouse = params.get("warehouse") || params.get("sklad");
  const sharePct = params.get("share") || params.get("dolya");
  const purchaseCost = params.get("cost") || params.get("purchase");
  const purchaseDate = params.get("date");
  return {
    warehouse: warehouse ? parseInt(warehouse, 10) : null,
    sharePct: sharePct ? parseFloat(sharePct) : null,
    purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
    purchaseDate: purchaseDate || null,
  };
}

function applyUrlParams(state) {
  const url = parseUrlParams();
  if (url.warehouse >= 1 && url.warehouse <= 3) {
    document.getElementById("warehouse").value = url.warehouse;
  }
  if (url.sharePct != null && url.sharePct > 0 && url.sharePct <= 100) {
    document.getElementById("sharePct").value = url.sharePct;
  }
  if (url.purchaseCost != null && url.purchaseCost > 0) {
    document.getElementById("purchaseCost").value = url.purchaseCost;
  }
  if (url.purchaseDate) {
    document.getElementById("purchaseDate").value = url.purchaseDate;
  }
  // Стоимость переуступки = стоимость покупки + 10%, округление до 100К
  const cost = parseFloat(document.getElementById("purchaseCost").value);
  if (cost > 0) {
    const saleToInvestor = Math.round((cost * 1.1) / 100000) * 100000;
    document.getElementById("saleToInvestor").value = saleToInvestor;
  }
}

function getState() {
  const warehouse = parseInt(document.getElementById("warehouse").value, 10);
  const area = WAREHOUSE_AREAS[warehouse] || 1000;
  const sharePct = parseFloat(document.getElementById("sharePct").value) / 100;
  const purchaseCost = parseFloat(document.getElementById("purchaseCost").value);
  const purchaseDate = new Date(document.getElementById("purchaseDate").value);
  const shareSqm = area * sharePct;
  const pricePerSqm = purchaseCost / shareSqm;
  const ownershipMonths = Math.max(
    0,
    ((Date.now() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 12
  );

  const rentIndexation = parseFloat(document.getElementById("rentIndexation").value) / 100;
  const rentVacation = parseFloat(document.getElementById("rentVacation").value);

  const scenarios = ["A", "B", "C", "D"].map((k) => ({
    months: parseFloat(document.getElementById(`scenario-months-${k}`).value) || 0,
    price: parseFloat(document.getElementById(`scenario-price-${k}`).value) || 0,
    rent: parseFloat(document.getElementById(`scenario-rent-${k}`).value) || 0,
  }));

  const purchaseDateStr = document.getElementById("purchaseDate").value;

  return {
    warehouse,
    area,
    sharePct,
    purchaseCost,
    purchaseDate: purchaseDateStr,
    shareSqm,
    pricePerSqm,
    ownershipMonths,
    rentIndexation,
    rentVacation,
    saleToInvestor: parseFloat(document.getElementById("saleToInvestor").value),
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

function calcYieldNPV(totalIncome, monthsToSale, purchaseCost, totalOwnershipMonths) {
  if (monthsToSale <= 0 || totalOwnershipMonths <= 0) return null;
  const growth = totalIncome / purchaseCost / monthsToSale;
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
  document.getElementById("out-ownershipMonths").textContent =
    state.ownershipMonths.toFixed(1);

  const investorYield =
    state.ownershipMonths > 0 && state.purchaseCost > 0
      ? ((state.saleToInvestor - state.purchaseCost) / state.purchaseCost / state.ownershipMonths) *
      12
      : null;
  document.getElementById("out-investorYield").textContent = fmtPct(investorYield);

  // Таблица дохода от продажи (синяя диагональ: 110k→48м, 105k→36м, 100k→24м, 95k→12м, 80k→0м)
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

  // Таблица дохода от аренды
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

  // Сценарии
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

    document.getElementById(`out-rent-${k}`).textContent = fmtNum(rentIncome);
    document.getElementById(`out-sale-${k}`).textContent = fmtNum(saleIncome);

    const totalIncome = rentIncome + saleIncome;
    const yNpv = calcYieldNPV(totalIncome, s.months, state.purchaseCost, totalMonths);
    const ySimple = calcYieldSimple(totalIncome, state.purchaseCost, totalMonths);

    const npvEl = document.getElementById(`out-yield-npv-${k}`);
    const simpleEl = document.getElementById(`out-yield-simple-${k}`);
    npvEl.textContent = fmtPct(yNpv);
    simpleEl.textContent = fmtPct(ySimple);
    npvEl.style.backgroundColor = yieldToBgColor(yNpv);
    simpleEl.style.backgroundColor = yieldToBgColor(ySimple);
  });
}

function downloadExcel(state) {

  const wb = XLSX.utils.book_new();

  const params = [
    ["Номер склада", state.warehouse],
    ["Ваша доля, %", state.sharePct * 100],
    ["Стоимость покупки доли, руб.", state.purchaseCost],
    ["Дата покупки", document.getElementById("purchaseDate").value],
    ["Общая площадь склада, кв. м", state.area],
    ["Ваша доля в кв. м", state.shareSqm],
    ["Цена покупки, руб. / кв. м", state.pricePerSqm],
    ["Текущий срок владения, мес.", state.ownershipMonths],
    ["Стоимость продажи доли, руб.", state.saleToInvestor],
    ["Индексация аренды, % в год", state.rentIndexation * 100],
    ["Арендные каникулы, мес.", state.rentVacation],
  ];

  state.scenarios.forEach((s, i) => {
    params.push([`Сценарий ${["A", "B", "C", "D"][i]} срок, мес.`, s.months]);
    params.push([`Сценарий ${["A", "B", "C", "D"][i]} цена, руб/кв.м`, s.price]);
    params.push([`Сценарий ${["A", "B", "C", "D"][i]} аренда, руб/кв.м/мес.`, s.rent]);
  });

  const wsParams = XLSX.utils.aoa_to_sheet(params);
  XLSX.utils.book_append_sheet(wb, wsParams, "Параметры");

  const instr = [
    ["1. Калькулятор рассчитывает доходность в трёх сценариях"],
    ["А. Немедленная продажа доли другому инвестору"],
    ["Б. Немедленная продажа на рынок с дисконтом"],
    ["В. Сдача в аренду с продажей при восстановлении рынка"],
    [""],
    ["2. Параметры расчёта загружены с веб-калькулятора."],
    ["   Импортируйте значения из листа «Параметры» в исходный Excel-файл калькулятора."],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instr);
  XLSX.utils.book_append_sheet(wb, wsInstr, "Инструкция");

  const fn = `Фрязино-калькулятор-параметры-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fn);
}

function init() {
  applyUrlParams(getState());

  const update = () => {
    const state = getState();
    render(state);
  };

  const inputs = document.querySelectorAll(
    "#warehouse, #sharePct, #purchaseCost, #purchaseDate, #saleToInvestor, #rentIndexation, #rentVacation, " +
    "[id^='scenario-']"
  );
  inputs.forEach((el) => el.addEventListener("input", update));
  inputs.forEach((el) => el.addEventListener("change", update));

  document.getElementById("btn-download-excel").addEventListener("click", () => {
    downloadExcel(getState());
  });

  update();
}

init();
