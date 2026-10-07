/*
 * Страница и стеклянная панель поверх живой фермы.
 * 3D-сцена — в scene.js (её API: createFarmScene). Пока 3D грузится или если WebGL нет,
 * работает запасная SVG-сцена из fallback.js с тем же API и своим демо-сценарием.
 */
import { CONTACT, SITE } from "./config.js";
import { createFallbackScene } from "./fallback.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const phoneMQ = matchMedia("(max-width: 760px)");

/* ---------- форматирование ---------- */
function makeFmt(o) {
  try { return new Intl.DateTimeFormat("ru-RU", Object.assign({ timeZone: SITE.timeZone, hour12: false }, o)); }
  catch { return new Intl.DateTimeFormat("ru-RU", Object.assign({ hour12: false }, o)); }
}
const fmtHM = makeFmt({ hour: "2-digit", minute: "2-digit" });
const fmtHMS = makeFmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = makeFmt({ day: "2-digit", month: "2-digit", year: "numeric" });
const hm = (d) => fmtHM.format(d);
const hms = (d) => fmtHMS.format(d);
const sec = (ms) => (Math.max(0.1, ms / 1000)).toFixed(1).replace(".", ",");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
function plateHtml(p, size = "") {
  const parts = String(p).trim().split(/\s+/);
  const reg = parts.length > 1 ? parts.pop() : "";
  return `<span class="plate${size ? " plate--" + size : ""}" aria-label="госномер ${esc(p)}"><span class="plate__kz" aria-hidden="true">KZ</span><span class="plate__num">${esc(parts.join(" "))}</span>${reg ? `<span class="plate__reg">${esc(reg)}</span>` : ""}</span>`;
}
let uidN = 0;
const uid = () => "e" + ++uidN;

/* ---------- справочники ---------- */
const ALARM_LABEL = {
  line_crossing: "Пересечение линии",
  intrusion: "Вторжение в зону",
  door_held: "Дверь не закрыта",
  unknown_face: "Неизвестное лицо",
  blacklist_plate: "Номер из чёрного списка",
};
/* так же, как называет тревоги сообщение платформы в Telegram */
const ALARM_TG = {
  line_crossing: "Пересечение линии",
  intrusion: "Вторжение в зону",
  door_held: "Дверь не закрыта",
  unknown_face: "Неизвестное лицо",
  blacklist_plate: "Номер из чёрного списка",
};
const KIND_LABEL = {
  gate: "въезд", checkpoint: "проходная", barn: "зона фермы", feed: "склад", office: "контора",
  perimeter: "периметр", processor: "процессор", vehicle: "машина", person: "сотрудник",
};
const KIND_ICON = {
  gate: "gate", checkpoint: "scan", barn: "barn", feed: "door", office: "door", perimeter: "camera", processor: "chip", vehicle: "truck", person: "user",
};
const DOOR_IDS = ["checkpoint", "feed", "office"];
const DOOR_NOUN = { checkpoint: "Турникет", feed: "Дверь", office: "Дверь" };
const POINT_NAME = { checkpoint: "Проходная", feed: "Склад кормов", office: "Контора", gate: "Въезд", barn: "Молочный блок" };
/* демо-тревоги закрываются сами через 25 с: так видно и тревогу, и её разбор */
const AUTO_RESOLVE_MS = 25000;
const AUTO_COMMENT = {
  line_crossing: "Охранник проверил: лиса у забора",
  intrusion: "Охранник проверил: в зоне никого",
  unknown_face: "Охранник проверил: посетитель без пропуска, развернули",
  door_held: "Дверь закрыли",
  blacklist_plate: "Шлагбаум не открыли, машина уехала",
};

/* машина демо-фермы с номером текущей фермы */
function veh(id) {
  const v = SITE.vehicles[id];
  return v ? Object.assign({}, v, { plate: v.plate[state.site] || v.plate.north }) : null;
}
function vehByPlate(plate) { return Object.keys(SITE.vehicles).find((k) => veh(k).plate === plate) || null; }
const enrolledOf = (p) => (p.enrolled && (p.enrolled[state.site] || p.enrolled.north)) || [0, 0];

function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function personInfo(name) {
  const known = SITE.people[name];
  if (known) return known;
  const h = hashStr(name);
  return { role: SITE.roles[h % SITE.roles.length], schedule: SITE.schedules[h % SITE.schedules.length], tab: 100 + (h % 40) };
}
function tabelFor(schedule) {
  if (/Сутки/i.test(schedule)) return "Я · 24 ч (16 + 8)";
  if (/20:00/.test(schedule)) return "Я · 11 ч, ночных 8";
  if (/05:00–17:00|Вахта/.test(schedule)) return "Я · 11 ч";
  if (/08:00–16:00/.test(schedule)) return "Я · 7 ч";
  return "Я · 8 ч";
}
function initials(name) {
  const p = String(name).replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((p[0] || "?")[0] + (p[1] ? p[1][0] : "")).toUpperCase();
}
const LOOKALIKE = { а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", х: "x", у: "y" };
function normKey(s) {
  return String(s).toLowerCase().replace(/ё/g, "е").replace(/[\s.,«»"'()\-–—·]/g, "");
}
function normPlate(s) { return normKey(s).replace(/[авекмнорстху]/g, (c) => LOOKALIKE[c] || c); }

/* ---------- состояние ---------- */
const state = {
  site: "north",
  sites: {},
  selected: null,
  tab: "passes",
  query: "",
  cmd: {},
  lastCommand: null,
  userPaused: reduced,
  offscreen: false,
  docHidden: document.hidden,
  feedOpen: false,
  detailDirty: false,
  feedDirty: false,
  pointerDown: false,
};
function makeSite(id) {
  const k = SITE.sites[id].kpi;
  return { kpi: Object.assign({}, k), passes: [], vehicles: [], alarms: [], lastFace: null, doors: {}, delta: {}, inside: new Set(["tractor"]) };
}
state.sites.north = makeSite("north");
state.sites.south = makeSite("south");
const cur = () => state.sites[state.site];

function seedHistory() {
  const now = Date.now();
  const ago = (min) => new Date(now - min * 60000);
  const N = state.sites.north, S = state.sites.south;
  const face = (person, point, objectId, result, min) => ({ id: uid(), type: "face", time: ago(min), person, point, objectId, result });
  N.passes = [
    face("Гульнара Мусина", "Проходная · вход", "checkpoint", "allowed", 3),
    face("Виктор Шевченко", "Проходная · вход", "checkpoint", "allowed", 9),
    face("Нурлан Искаков", "Контора", "office", "allowed", 14),
    face("Динара Ахметова", "Проходная · вход", "checkpoint", "allowed", 22),
    face("Неизвестное лицо", "Проходная · вход", "checkpoint", "denied", 31),
    face("Олжас Тулегенов", "Склад кормов", "feed", "allowed", 40),
  ];
  N.vehicles = [
    { id: uid(), type: "plate", time: ago(12), plate: SITE.vehicles["feed-truck"].plate.north, vehicle: "кормовоз КамАЗ", objectId: "gate", vehicleId: "feed-truck", result: "allowed", direction: "out" },
    { id: uid(), type: "plate", time: ago(47), plate: SITE.vehicles.tractor.plate.north, vehicle: "трактор Беларус", objectId: "gate", vehicleId: "tractor", result: "allowed", direction: "in" },
    { id: uid(), type: "plate", time: ago(63), plate: "088 KTA 02", vehicle: "легковая", objectId: "gate", vehicleId: null, result: "blacklist", direction: "in" },
    { id: uid(), type: "plate", time: ago(95), plate: SITE.vehicles["milk-truck"].plate.north, vehicle: "молоковоз", objectId: "gate", vehicleId: "milk-truck", result: "allowed", direction: "out" },
  ];
  N.alarms = [
    { id: uid(), type: "alarm", time: ago(52), kind: "line_crossing", where: "Периметр · северная сторона", objectId: "perimeter", resolved: false, comment: "" },
    { id: uid(), type: "alarm", time: ago(31), kind: "unknown_face", where: "Проходная · вход", objectId: "checkpoint", resolved: true, comment: "Курьер с документами, встретил охранник" },
    { id: uid(), type: "alarm", time: ago(63), kind: "blacklist_plate", where: "Въезд · 088 KTA 02", objectId: "gate", resolved: true, comment: "Шлагбаум не открыли, машина уехала" },
  ].sort((a, b) => b.time - a.time);
  N.lastFace = N.passes[0];
  S.passes = [
    face("Айгерим Сапарова", "Проходная · вход", "checkpoint", "allowed", 4),
    face("Бекзат Омаров", "Проходная · вход", "checkpoint", "allowed", 11),
    face("Наталья Ким", "Склад кормов", "feed", "allowed", 26),
    face("Сергей Литвиненко", "Проходная · выход", "checkpoint", "allowed", 38),
  ];
  S.vehicles = [
    { id: uid(), type: "plate", time: ago(18), plate: SITE.vehicles["milk-truck"].plate.south, vehicle: "молоковоз", objectId: "gate", vehicleId: "milk-truck", result: "allowed", direction: "out" },
    { id: uid(), type: "plate", time: ago(70), plate: SITE.vehicles.tractor.plate.south, vehicle: "трактор Беларус", objectId: "gate", vehicleId: "tractor", result: "allowed", direction: "in" },
  ];
  S.alarms = [
    { id: uid(), type: "alarm", time: ago(140), kind: "door_held", where: "Склад кормов", objectId: "feed", resolved: true, comment: "Разгружали корма, дверь закрыли" },
  ];
  S.lastFace = S.passes[0];
}

/* ---------- сцена ---------- */
const world = $("#world");
const stage = $("#world-stage");
const canvas = $("#world-canvas");
const posterEl = $("#world-poster");
const hud = $("#hud");
let scene = null;
let mode = "poster";
let poster = null;

function objectsList() {
  const list = (scene && Array.isArray(scene.objects) && scene.objects.length ? scene.objects : poster?.objects) || [];
  const here = list.filter((o) => !o.site || o.site === state.site);
  return here.length ? here : list;
}
function objInfo(id) {
  const list = (scene && scene.objects) || poster?.objects || [];
  const o = list.find((x) => x.id === id);
  if (o) return o;
  const kind = SITE.vehicles[id] ? "vehicle" : SITE.points[id] ? (id === "perimeter-cam" ? "perimeter" : id) : "person";
  return { id, kind, name: id };
}

/* ---------- KPI ---------- */
const kpiTimers = {};
function bump(key, d) {
  const s = cur();
  const max = key === "onSite" ? SITE.sites[state.site].scheduled : Infinity;
  const before = s.kpi[key] || 0;
  s.kpi[key] = Math.min(max, Math.max(0, before + d));
  d = s.kpi[key] - before;
  if (!d) return;
  s.delta[key] = d;
  clearTimeout(kpiTimers[key]);
  kpiTimers[key] = setTimeout(() => { delete cur().delta[key]; renderKpis(); }, 4000);
  const card = $(`.kpi[data-kpi="${key}"]`);
  if (card && !reduced) { card.classList.remove("is-flash"); void card.offsetWidth; card.classList.add("is-flash"); }
}
function renderKpis() {
  const s = cur(), site = SITE.sites[state.site];
  const subs = {
    onSite: `не пришли: ${Math.max(0, site.scheduled - s.kpi.onSite)} из ${site.scheduled}`,
    passes: "по лицу, с 00:00",
    vehicles: `сейчас внутри: ${s.inside.size}`,
    alarmsOpen: `решено сегодня: ${s.kpi.resolvedToday}`,
  };
  for (const key of ["onSite", "passes", "vehicles", "alarmsOpen"]) {
    const card = $(`.kpi[data-kpi="${key}"]`);
    if (!card) continue;
    $("[data-value]", card).textContent = s.kpi[key];
    const dEl = $("[data-delta]", card);
    const d = s.delta[key];
    dEl.textContent = d ? (d > 0 ? `+${d}` : `−${Math.abs(d)}`) : "";
    dEl.classList.toggle("is-on", Boolean(d));
    dEl.classList.toggle("is-down", d < 0 && key !== "alarmsOpen");
    dEl.classList.toggle("is-bad", d > 0 && key === "alarmsOpen");
    $("[data-sub]", card).textContent = subs[key];
    if (key === "alarmsOpen") card.classList.toggle("is-alert", s.kpi.alarmsOpen > 0);
  }
  renderSiteSwitch();
}

/* ---------- переключатель объектов ---------- */
function alarmsText(a) { return a ? `${a} ${plural(a, ["тревога", "тревоги", "тревог"])}` : "тревог нет"; }
function siteMeta(id) {
  const s = state.sites[id];
  return `${s.kpi.onSite} на месте · ${alarmsText(s.kpi.alarmsOpen)}`;
}
function renderSiteSwitch() {
  const site = SITE.sites[state.site];
  $("[data-site-badge]").textContent = site.short;
  // перерисовываем, только если текст поменялся: иначе нажатие на кнопку попадает в удалённый элемент
  const setHtml = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html; };
  setHtml($("[data-site-name]"), `${esc(site.name)}<span class="ss-temp"> · ${esc(site.temp)}</span>`);
  // на телефоне: «−32 °C · 1 тревога», на компьютере: «23 на месте · 1 тревога»
  const s = cur();
  setHtml($("[data-site-meta]"), `<span class="ss-meta-temp">${esc(site.temp)} · </span><span class="ss-meta-onsite">${s.kpi.onSite} на месте · </span>${esc(alarmsText(s.kpi.alarmsOpen))}`);
  const list = $("#site-switch-list");
  if (!list.hidden) {
    list.innerHTML = Object.values(SITE.sites).map((s) => `
      <li role="option" id="ss-${s.id}" data-site="${s.id}" aria-selected="${s.id === state.site}" tabindex="-1">
        <span class="site-switch__badge"${s.id === "south" ? ' style="background:#a8641f"' : ""}>${s.short}</span>
        <span class="ss-text"><b>${esc(s.name)} · ${esc(s.temp)}</b><span>${esc(s.region)} · ${esc(siteMeta(s.id))}</span></span>
      </li>`).join("");
  }
}
function openSiteList(open) {
  const btn = $("#site-switch-btn"), list = $("#site-switch-list");
  list.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (open) { renderSiteSwitch(); $(`#ss-${state.site}`)?.focus(); }
}
async function switchSite(id) {
  if (!SITE.sites[id] || id === state.site) { openSiteList(false); return; }
  state.site = id;
  world.dataset.site = id;
  state.selected = null;
  hud.classList.remove("has-selection");
  stopTour();
  clearTimeout(toastTimer);
  $("#hud-toast").classList.remove("is-on");
  openSiteList(false);
  $("#site-switch-btn").focus();
  renderAll();
  syncInsets(true);
  try { scene?.select(null); await scene?.setSite(id); } catch (e) { console.warn("setSite", e); }
}

/* ---------- журнал ---------- */
/* слова без рода: в журнале и мужчины, и женщины, и «неизвестное лицо» */
const PILL = {
  allowed: ["ok", "Разрешён"],
  denied: ["bad", "Отказ"],
  remote: ["info", "Открыто"],
  not_in_list: ["warn", "Нет в списке"],
  blacklist: ["bad", "Чёрный список"],
};
function platePill(r) {
  if (r.result === "allowed") return ["ok", r.direction === "out" ? "Выезд" : "Въезд"];
  return PILL[r.result] || PILL.allowed;
}
const resultWord = (r) => (r.result === "allowed" ? "проход разрешён" : r.result === "remote" ? "открыто из приложения" : "отказ");

/* Перерисовка не сбивает фокус клавиатуры и не съедает нажатие: пока кнопка мыши зажата над панелью,
   перерисовку откладываем, а фокус возвращаем на тот же элемент. */
function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return "#" + CSS.escape(el.id);
  for (const a of ["data-key", "data-act", "data-select", "data-alarm"]) {
    const v = el.getAttribute && el.getAttribute(a);
    if (v != null) {
      const id = el.getAttribute("data-id");
      return `[${a}="${CSS.escape(v)}"]` + (id ? `[data-id="${CSS.escape(id)}"]` : "");
    }
  }
  return null;
}
function keepFocus(container, render, fallback) {
  const active = document.activeElement;
  const inside = active && container.contains(active);
  const key = inside ? focusKey(active) : null;
  const scroll = container.scrollTop;
  render();
  if (inside) {
    const next = key && container.querySelector(key);
    if (next) next.focus({ preventScroll: true });
    else (fallback || container).focus?.({ preventScroll: true });
  }
  container.scrollTop = scroll;
}
function rowText(r) {
  if (r.type === "face") return `${r.person} ${r.point}`;
  if (r.type === "plate") return `${r.plate} ${r.vehicle}`;
  return `${ALARM_LABEL[r.kind] || r.kind} ${r.where}`;
}
function matches(r) {
  if (!state.query) return true;
  const q = normKey(state.query), qp = normPlate(state.query);
  return normKey(rowText(r)).includes(q) || normPlate(rowText(r)).includes(qp);
}
const newRows = new Set();
function feedRow(r) {
  const isNew = newRows.has(r.id);
  let main = "", pill = "", bad = false;
  if (r.type === "face") {
    const [cls, txt] = PILL[r.result] || PILL.allowed;
    bad = r.result === "denied";
    main = `<b>${esc(r.person)}</b><span>${esc(r.point)}</span>`;
    pill = `<span class="pill pill--${cls}">${txt}</span>`;
  } else if (r.type === "plate") {
    const [cls, txt] = platePill(r);
    bad = r.result !== "allowed";
    // направление уже на плашке («Въезд» / «Выезд»), под номером только машина
    const sub = r.result === "not_in_list" ? "Не пропущен — номера нет в списке" : r.vehicle;
    main = `<b>${plateHtml(r.plate, "sm")}</b><span>${esc(sub)}</span>`;
    pill = `<span class="pill pill--${cls}">${txt}</span>`;
  } else {
    bad = !r.resolved;
    main = `<b>${esc(ALARM_LABEL[r.kind] || r.kind)}</b><span>${esc(r.where)}</span>`;
    pill = r.resolved ? `<span class="pill pill--muted">Решено</span>` : `<span class="pill pill--bad">Открыта</span>`;
  }
  const target = r.type === "plate" ? (r.vehicleId && objInfo(r.vehicleId).kind === "vehicle" && SITE.vehicles[r.vehicleId] ? r.vehicleId : "gate") : r.objectId;
  return `<li><button type="button" class="feed-row${isNew ? " is-new" : ""}${isNew && bad ? " is-badrow" : ""}" data-select="${esc(target)}" data-key="${r.id}"><time class="feed-row__time" datetime="${r.time.toISOString()}">${hms(r.time)}</time><span class="feed-row__main">${main}</span>${pill}</button></li>`;
}
function renderFeed(force) {
  if (!force && state.pointerDown) { state.feedDirty = true; return; }
  state.feedDirty = false;
  const s = cur();
  for (const tab of ["passes", "vehicles", "alarms"]) {
    const rows = s[tab].filter(matches).slice(0, 40);
    const ul = $(`[data-panel="${tab}"]`);
    keepFocus(ul, () => { ul.innerHTML = rows.length ? rows.map(feedRow).join("") : `<li class="feed-empty">${state.query ? "Ничего не найдено" : "Пока пусто"}</li>`; }, $(`#tab-${tab}`));
    $(`[data-count="${tab}"]`).textContent = s[tab].length;
  }
  $("#tab-alarms").classList.toggle("has-open", s.alarms.some((a) => !a.resolved));
  newRows.clear();
  const last = [s.passes[0], s.vehicles[0], s.alarms[0]].filter(Boolean).sort((a, b) => b.time - a.time)[0];
  if (last) $("#feed-last").textContent = `${hm(last.time)} · ${last.type === "face" ? `${last.person}: ${resultWord(last)}` : last.type === "plate" ? `${last.plate}: ${platePill(last)[1].toLowerCase()}` : ALARM_LABEL[last.kind]}`;
  updateScrollHints();
}
function setTab(tab, focus) {
  state.tab = tab;
  for (const b of $$(".feed-tab")) {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  for (const p of $$(".feed-panel")) p.hidden = p.dataset.tabpanel !== tab;
  updateScrollHints();
}

/* ---------- путь сотрудника ---------- */
function renderTimeline() {
  const el = $("#hud-timeline");
  const f = cur().lastFace;
  if (!f) { el.innerHTML = ""; return; }
  const t = f.time;
  const before = new Date(t.getTime() - 14000);
  const info = personInfo(f.person);
  const denied = f.result !== "allowed";
  const inner = f.objectId !== "checkpoint";
  const exit = /выход/i.test(f.point);
  const step = (cls, ic, title, sub, isTime) => `<li class="tl-step ${cls}"><span class="tl-dot">${icon(ic)}</span><b>${title}</b>${isTime ? `<time>${sub}</time>` : `<span>${esc(sub)}</span>`}</li>`;
  let steps;
  if (denied) {
    steps = step("", "user", "У терминала", hms(before), true) + step("is-bad", "scan", "Face ID", "нет в базе") + step("is-bad", "lock", "Проход", "закрыт") + step("is-bad", "alert", "Тревога", "охране и в Telegram");
  } else if (inner) {
    steps = step("", "user", "На смене", "с утра") + step("", "scan", "Face ID", `лицо узнано, ${hms(t)}`) + step("", "door", "Дверь", POINT_NAME[f.objectId] || f.point) + step("", "table", "Табель", "внутренние двери не меняют часы");
  } else if (exit) {
    steps = step("", "scan", "Face ID", hms(before), true) + step("", "door", "Выход", f.point) + step("", "user", "Уход", hms(t), true) + step("", "table", "Табель", tabelFor(info.schedule).replace("Я · ", "Я · смена "));
  } else {
    steps = step("", "user", "Приход", hms(before), true) + step("", "scan", "Face ID", "лицо узнано") + step("", "door", "Проход", f.point) + step("", "table", "Табель", tabelFor(info.schedule));
  }
  el.innerHTML = `
    <div class="tl-main">
      <div class="tl-head"><h2>${icon("scan")}Путь сотрудника</h2><span>${esc(f.person)} · ${hm(t)}</span></div>
      <ol class="tl-steps">${steps}</ol>
    </div>
    <div class="tl-person">
      <span class="tl-avatar${denied ? " is-bad" : ""}" aria-hidden="true">${denied ? "?" : esc(initials(f.person))}</span>
      <b>${esc(denied ? "Лицо не найдено" : f.person)}</b>
      <span>${esc(denied ? "нет в базе сотрудников" : info.role)}</span>
      <span class="tl-meta">${denied ? `<span class="pill pill--bad">Тревога</span><span class="pill pill--muted">фото у охраны</span>` : `<span class="pill pill--info">${esc(info.schedule)}</span><span class="pill pill--muted">Таб. № ${info.tab}</span>`}</span>
    </div>`;
}

/* ---------- карточка справа ---------- */
function setSelected(id, fromScene) {
  state.selected = id || null;
  hud.classList.toggle("has-selection", Boolean(state.selected));
  renderDetail(true);
  // карточка уже на месте: камера считает свободную часть кадра с её учётом
  syncInsets(true);
  if (!fromScene) { try { scene?.select(state.selected); } catch (e) { console.warn(e); } }
}
function closeBtn() { return `<button class="icon-btn dt-close" type="button" data-act="close" aria-label="Закрыть карточку">${icon("close")}</button>`; }
function head(ic, eyebrow, title, sub, tone = "") {
  return `<div class="dt-head"><span class="dt-icon${tone ? " dt-icon--" + tone : ""}">${icon(ic)}</span><div class="dt-titles"><div class="dt-eyebrow">${esc(eyebrow)}</div><div class="dt-title" id="dt-title">${esc(title)}</div>${sub ? `<div class="dt-sub">${sub}</div>` : ""}</div>${state.selected ? closeBtn() : ""}</div>`;
}
const online = (extra) => `<div class="dt-status"><span class="pill pill--ok"><span class="dot dot--ok"></span>На связи</span>${extra ? `<span>${esc(extra)}</span>` : ""}</div>`;
/* длинное значение встаёт под подпись и выравнивается влево, а не рвётся справа на три строки */
function kv(rows) {
  return `<dl class="kv">${rows.map(([k, v]) => {
    const len = String(v).replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "x").length;
    const long = len > 22 || len + String(k).length > 36;
    const cls = long ? ' class="is-stack"' : "";
    return `<dt${cls}>${esc(k)}</dt><dd${cls}>${v}</dd>`;
  }).join("")}</dl>`;
}
// сначала открытая тревога (её можно закрыть из карточки), иначе последняя
function lastAlarmFor(ids) { const list = cur().alarms.filter((a) => ids.includes(a.objectId)); return list.find((a) => !a.resolved) || list[0]; }
function alarmBlock(a) {
  if (!a) return "";
  const title = ALARM_LABEL[a.kind] || a.kind;
  if (a.resolved) {
    return `<div class="dt-alarm is-resolved"><div class="dt-alarm__head"><span class="pill pill--muted">Решено</span><time>${hms(a.time)}</time></div><div class="dt-alarm__title">${esc(title)}</div><div class="dt-alarm__where">${esc(a.where)}</div>${a.comment ? `<p class="dt-alarm__comment">Комментарий: ${esc(a.comment)}</p>` : ""}</div>`;
  }
  return `<form class="dt-alarm" data-alarm="${a.id}" novalidate><div class="dt-alarm__head"><span class="pill pill--bad">Открыта</span><time>${hms(a.time)}</time></div><div class="dt-alarm__title">${esc(title)}</div><div class="dt-alarm__where">${esc(a.where)}</div><label class="sr-only" for="c-${a.id}">Комментарий к тревоге</label><textarea id="c-${a.id}" rows="2" placeholder="Что случилось? Например: лиса у забора" aria-describedby="m-${a.id}">${esc(drafts.get(a.id) || "")}</textarea><p class="dt-alarm__msg" id="m-${a.id}">Без комментария тревогу закрыть нельзя.</p><button class="btn btn--dark" type="submit">${icon("check")}Решено</button></form>`;
}
const drafts = new Map();
function cmdStatus(id) {
  const c = state.cmd[id];
  if (!c) return `<p class="cmd-status" role="status" aria-live="polite"></p>`;
  if (c.phase === "sending") return `<p class="cmd-status" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Команда отправлена…</p>`;
  if (c.phase === "ok") return `<p class="cmd-status is-ok" role="status" aria-live="polite">${icon("check")}Команда отправлена → Дверь открыта за ${sec(c.ms)} с</p>`;
  return `<p class="cmd-status is-bad" role="status" aria-live="polite">${esc(c.text || "Терминал не ответил. Попробуйте ещё раз.")}</p>`;
}
function lastEventFor(id) { return cur().passes.find((r) => r.objectId === id); }
function lastEventText(last) {
  if (!last) return "—";
  if (last.result === "remote") return `Открыл ${esc(SITE.user.name)} · ${hm(last.time)}`;
  return `${esc(last.person)} · ${hm(last.time)} · ${last.result === "allowed" ? "разрешён" : "отказ"}`;
}
function terminalCard(id) {
  const p = SITE.points[id];
  const s = cur();
  const devs = p.devices.map((d) => [`Терминал${p.devices.length > 1 ? ", " + d.role : ""}`, `<span class="mono">${esc(d.model)}</span>`]);
  const lastTxt = lastEventText(lastEventFor(id));
  const [en, all] = enrolledOf(p);
  const doorState = s.doors[id] === "open" ? "открыт" + (DOOR_NOUN[id] === "Дверь" ? "а" : "") : "закрыт" + (DOOR_NOUN[id] === "Дверь" ? "а" : "");
  const sending = state.cmd[id]?.phase === "sending";
  const alarm = lastAlarmFor([id]);
  // открытая тревога — сразу под статусом, с полем комментария и кнопкой «Решено»
  return head(id === "checkpoint" ? "scan" : "door", p.eyebrow, p.title, `${esc(p.devices[0].brand)} ${esc(p.devices[0].model)}${p.devices.length > 1 ? " × " + p.devices.length : ""}`)
    + online(p.link)
    + (alarm && !alarm.resolved ? alarmBlock(alarm) : "")
    + `<div class="dt-actions"><button class="btn btn--primary" type="button" data-act="open" data-id="${id}"${sending ? " disabled" : ""}>${icon("door")}Открыть дверь</button>${cmdStatus(id)}</div>`
    + kv([
      ...devs,
      [id === "checkpoint" ? "Сотрудников на терминале" : "Допущено к двери", `${en} из ${all}`],
      [DOOR_NOUN[id], doorState],
      ["Последнее событие", lastTxt],
    ])
    + (alarm && alarm.resolved ? alarmBlock(alarm) : "");
}
function gateCard() {
  const p = SITE.points.gate, s = cur();
  const rows = s.vehicles.slice(0, 5).map((r) => {
    const [cls, txt] = platePill(r);
    return `<li>${plateHtml(r.plate, "sm")}<span class="grow">${esc(r.vehicle)}</span><span class="pill pill--${cls}">${txt}</span></li>`;
  }).join("");
  const last = s.vehicles[0];
  const alarm = lastAlarmFor(["gate"]);
  return head("gate", p.eyebrow, p.title, `Hikvision DS-TCG406-E · шлагбаум`)
    + online(p.link)
    + (alarm && !alarm.resolved ? alarmBlock(alarm) : "")
    + kv([
      ["Камера номеров", `<span class="mono">DS-TCG406-E</span>`],
      ["Шлагбаум", s.doors.gate === "open" ? "открыт" : "закрыт"],
      ["Белый список", `${p.whiteList} ${plural(p.whiteList, ["номер", "номера", "номеров"])}`],
      ["Чёрный список", `${p.blackList} ${plural(p.blackList, ["номер", "номера", "номеров"])}`],
      ["Машин сегодня", String(s.kpi.vehicles)],
    ])
    + `<div class="dt-section"><div class="dt-section__title">Последние номера<span>по времени</span></div><ul class="dt-plates">${rows || "<li>Пока машин не было</li>"}</ul></div>`
    + (last && last.result === "not_in_list" ? `<p class="dt-note">Не пропущен — номера нет в списке. Охранник может добавить номер в белый список, если машина своя.</p>` : "")
    + (alarm && alarm.resolved ? alarmBlock(alarm) : "");
}
function processorCard() {
  const p = SITE.points.processor, s = cur();
  const lc = state.lastCommand;
  return head("chip", p.eyebrow, p.title, "мини-ПК в шкафу на стене проходной", "ice")
    + online("шифрованный канал в облако")
    + kv([
      ["Облако", "серверы в Казахстане"],
      ["Очередь событий", "пуста"],
      ["Без интернета", "копит события до 30 дней"],
      ["Устройств в сети фермы", String(p.devicesOnline)],
      ["Событий сегодня", String(s.kpi.passes + s.kpi.vehicles)],
      ["Последняя команда", lc ? `${esc(lc.what)} · ${sec(lc.ms)} с` : "загрузка 12 лиц"],
    ])
    + `<p class="dt-note">На связи, очередь пуста. Если пропадёт интернет, двери и шлагбаум продолжат работать, а события уйдут в облако, когда связь вернётся. Контора с ZKTeco работает с облаком напрямую.</p>`;
}
function perimeterCard(id) {
  const p = SITE.points[id] || SITE.points.perimeter;
  const a = lastAlarmFor(["perimeter", "perimeter-cam"]);
  const open = a && !a.resolved;
  return head("camera", p.eyebrow, p.title, `Hikvision DS-2CD1043G2-LIU × ${p.cameras}`, open ? "bad" : "")
    + `<div class="dt-status">${open ? `<span class="pill pill--bad">Тревога</span>` : `<span class="pill pill--ok"><span class="dot dot--ok"></span>На связи</span>`}<span>${esc(p.link)}</span></div>`
    + (open ? alarmBlock(a) : "")
    + kv([
      ["Камер на заборе", String(p.cameras)],
      ["Правила", "линия на заборе, вторжение в зону"],
      ["Если камеру закроют", "тревога «Камеру закрыли»"],
      ["Уведомление", "в Telegram сразу"],
    ])
    + (open ? "" : a ? alarmBlock(a) : `<p class="dt-note">Тревог по периметру сегодня не было.</p>`);
}
function barnCard() {
  const p = SITE.points.barn, s = cur();
  const milk = veh("milk-truck");
  const mt = s.vehicles.find((r) => r.plate === milk.plate);
  const status = mt ? (mt.direction === "in" ? `у блока с ${hm(mt.time)}` : `уехал в ${hm(mt.time)}`) : "сегодня не приезжал";
  const d = p.devices[0];
  const last = lastEventFor("barn");
  const lastTxt = last ? `${esc(last.person)} · ${hm(last.time)}` : "сегодня не было";
  const [en, all] = enrolledOf(p);
  return head("barn", p.eyebrow, p.title, `${esc(d.brand)} ${esc(d.model)} · ${esc(d.role)}`)
    + online(p.link)
    + kv([
      ["Терминал", `<span class="mono">${esc(d.model)}</span>`],
      ["Допущено к двери", `${en} из ${all}`],
      ["Последний проход", lastTxt],
      [`Молоковоз ${milk.plate}`, esc(status)],
      ["Доение", "2/2 · бригады А и Б"],
    ])
    + `<p class="dt-note">Проходы в молочный блок видны в журнале. Часы в табеле считаются по проходной, внутренние двери на них не влияют.</p>`;
}
function vehicleCard(id) {
  const v = veh(id) || { plate: "—", type: "машина", list: "none" };
  const s = cur();
  const rows = s.vehicles.filter((r) => r.plate === v.plate);
  const last = rows[0];
  const listTxt = v.list === "white" ? `<span class="pill pill--ok">Белый список</span>` : v.list === "black" ? `<span class="pill pill--bad">Чёрный список</span>` : `<span class="pill pill--warn">Нет в списке</span>`;
  return head("truck", "Машина", v.type.charAt(0).toUpperCase() + v.type.slice(1), "")
    + `<div class="dt-plate-big">${plateHtml(v.plate, "lg")}</div>`
    + kv([
      ["Список", listTxt],
      ["Последний проезд", last ? `${last.direction === "out" ? "выезд" : "въезд"} · ${hm(last.time)}` : "сегодня не было"],
      ["Проездов сегодня", String(rows.length)],
      ["Сейчас", s.inside.has(id) ? "на территории" : "за воротами"],
    ])
    + (v.list === "none" ? `<p class="dt-note">Не пропущен — номера нет в списке. Шлагбаум остался закрытым, машина развернулась.</p>` : "");
}
function personCard(id) {
  const o = objInfo(id);
  const name = o.name && o.name !== id ? o.name : "Сотрудник";
  const info = personInfo(name);
  const last = cur().passes.find((r) => r.person === name);
  return head("user", "Сотрудник", name, esc(info.role))
    + kv([
      ["График", esc(info.schedule)],
      ["Таб. №", String(info.tab)],
      ["Сегодня", last ? `${esc(last.point)} · ${hm(last.time)}` : "на территории с утра"],
      ["В табеле", esc(tabelFor(info.schedule))],
    ]);
}
function overviewCard() {
  const site = SITE.sites[state.site], s = cur();
  const alarms = s.kpi.alarmsOpen;
  const pts = [
    ["checkpoint", "scan", "Проходная"], ["gate", "gate", "Въезд"], ["barn", "barn", "Молочный блок"], ["feed", "door", "Склад кормов"],
    ["office", "door", "Контора"], ["perimeter", "camera", "Периметр"], ["processor", "chip", "Процессор"],
  ];
  const openFor = (id) => s.alarms.some((a) => !a.resolved && (a.objectId === id || (id === "perimeter" && a.objectId === "perimeter-cam")));
  const list = pts.map(([id, ic, name]) => `<li><button type="button" data-select="${id}">${icon(ic)}<span class="grow">${name}</span>${openFor(id) ? `<span class="pill pill--bad">Тревога</span>` : `<span class="pill pill--ok">На связи</span>`}</button></li>`).join("");
  const pct = Math.round((s.kpi.onSite / site.scheduled) * 100);
  return head("barn", `Объект · ${site.region}`, site.name, `${esc(site.temp)} · ${esc(site.weather)}`)
    + `<div class="dt-status">${alarms ? `<span class="pill pill--bad">${alarms} ${plural(alarms, ["открытая тревога", "открытые тревоги", "открытых тревог"])}</span>` : `<span class="pill pill--ok"><span class="dot dot--ok"></span>Всё на связи</span>`}<span>${pts.length} ${plural(pts.length, ["точка", "точки", "точек"])} · процессор на связи</span></div>`
    + `<div class="dt-tiles">
        <div class="dt-tile"><span>На территории</span><b>${s.kpi.onSite} <small>/ ${site.scheduled}</small></b><span class="meter"><span style="width:${Math.min(100, pct)}%"></span></span></div>
        <div class="dt-tile"><span>Точки доступа</span><b>5 <small>/ 5 на связи</small></b><span class="meter"><span style="width:100%"></span></span></div>
        <div class="dt-tile"><span>Машины сегодня</span><b>${s.kpi.vehicles}</b><span class="meter"><span style="width:${Math.min(100, s.kpi.vehicles * 8)}%"></span></span></div>
        <div class="dt-tile"><span>Проходов сегодня</span><b>${s.kpi.passes}</b><span class="meter"><span style="width:${Math.min(100, s.kpi.passes)}%"></span></span></div>
      </div>`
    + `<div class="dt-section"><div class="dt-section__title">Точки фермы<span>нажмите, чтобы открыть</span></div><ul class="dt-list">${list}</ul></div>`
    + `<p class="dt-note">${esc(SITE.demoNote)}</p>`;
}
function renderDetail(force) {
  const el = $("#hud-detail");
  if (!force && ((el.contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName)) || state.pointerDown)) { state.detailDirty = true; return; }
  state.detailDirty = false;
  const id = state.selected;
  let html;
  if (!id) html = overviewCard();
  else {
    const o = objInfo(id);
    const kind = o.kind || "person";
    if (DOOR_IDS.includes(id)) html = terminalCard(id);
    else if (id === "gate" || kind === "gate") html = gateCard();
    else if (id === "processor" || kind === "processor") html = processorCard();
    else if (kind === "perimeter" || id.startsWith("perimeter")) html = perimeterCard(id);
    else if (id === "barn" || kind === "barn") html = barnCard();
    else if (kind === "vehicle" || SITE.vehicles[id]) html = vehicleCard(id);
    else html = personCard(id);
  }
  keepFocus(el, () => { el.innerHTML = html; }, el);
  el.setAttribute("aria-labelledby", "dt-title");
  updateScrollHints();
}

/* ---------- команды ---------- */
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
const doorTimers = {};
async function openDoor(id) {
  if (!scene || state.cmd[id]?.phase === "sending") return;
  if (isPaused()) {
    state.cmd[id] = { phase: "err", text: "Демо на паузе. Нажмите «Запустить» на сцене и попробуйте ещё раз." };
    renderDetail(true);
    return;
  }
  const t0 = performance.now();
  state.cmd[id] = { phase: "sending" };
  renderDetail(true);
  $(`[data-act="open"][data-id="${id}"]`)?.focus();
  try {
    const res = await withTimeout(Promise.resolve(scene.openDoor(id)), 8000);
    const ms = res && typeof res.ms === "number" ? res.ms : performance.now() - t0;
    state.cmd[id] = { phase: "ok", ms };
    state.lastCommand = { what: `Открыть дверь · ${POINT_NAME[id]}`, ms };
    const s = cur();
    // дверь открыта; если сцена сама не пришлёт «закрыта», закрываем через 6 с, как терминал по таймеру
    s.doors[id] = "open";
    clearTimeout(doorTimers[id]);
    doorTimers[id] = setTimeout(() => { if (s.doors[id] === "open") { s.doors[id] = "closed"; if (state.selected === id) renderDetail(); } }, 6000);
    const row = { id: uid(), type: "face", time: new Date(), person: `${SITE.user.name}, из приложения`, point: `${POINT_NAME[id]}: ${DOOR_NOUN[id].toLowerCase()} открыт${DOOR_NOUN[id] === "Дверь" ? "а" : ""}`, objectId: id, result: "remote" };
    s.passes.unshift(row);
    newRows.add(row.id);
    renderFeed();
    announce(`${POINT_NAME[id]}: дверь открыта за ${sec(ms)} секунды.`, true);
  } catch {
    state.cmd[id] = { phase: "err" };
  }
  if (state.selected === id) { renderDetail(true); $(`[data-act="open"][data-id="${id}"]`)?.focus(); }
  setTimeout(() => {
    if (state.cmd[id] && state.cmd[id].phase !== "sending") { delete state.cmd[id]; if (state.selected === id) renderDetail(); }
  }, 9000);
}
function resolveAlarm(form) {
  const id = form.dataset.alarm;
  const a = cur().alarms.find((x) => x.id === id);
  const ta = $("textarea", form), msg = $(".dt-alarm__msg", form);
  const text = ta.value.trim();
  if (text.length < 3) {
    ta.classList.add("is-invalid");
    ta.setAttribute("aria-invalid", "true");
    msg.textContent = "Напишите, что произошло. Без комментария тревогу закрыть нельзя.";
    msg.classList.add("is-bad");
    ta.focus();
    return;
  }
  if (!a || a.resolved) return;
  a.resolved = true;
  a.comment = text;
  drafts.delete(id);
  bump("alarmsOpen", -1);
  cur().kpi.resolvedToday += 1;
  renderKpis();
  renderFeed();
  renderDetail(true);
  announce(`Тревога «${ALARM_LABEL[a.kind]}» закрыта с комментарием.`, true);
  $("#hud-detail .dt-close")?.focus();
}

/* ---------- события сцены ---------- */
let toastTimer = 0;
function showToast(a) {
  const el = $("#hud-toast");
  const d = a.time;
  el.innerHTML = `<span class="tg-note__app">${icon("send")}Telegram · QazTracker</span><pre>Тревога: ${esc(ALARM_TG[a.kind] || ALARM_LABEL[a.kind] || a.kind)}\nГде: ${esc(a.where)}\nОбъект: ${esc(SITE.sites[state.site].name)}\nВремя: ${fmtDate.format(d)} ${hm(d)}</pre>`;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 5200);
}
let annLast = 0, annPending = "", annTimer = 0;
function announce(text, force) {
  annPending = text;
  const flush = () => { $("#live-announcer").textContent = annPending; annLast = Date.now(); annPending = ""; };
  if (force) { clearTimeout(annTimer); flush(); return; }
  if (state.offscreen || state.docHidden) return;
  const wait = 10000 - (Date.now() - annLast);
  clearTimeout(annTimer);
  if (wait <= 0) flush(); else annTimer = setTimeout(flush, wait);
}
function handleEvent(evt) {
  if (!evt || !evt.type) return;
  const s = cur();
  const time = evt.time instanceof Date && !isNaN(evt.time) ? evt.time : new Date();
  if (evt.type === "face") {
    const row = { id: uid(), type: "face", time, person: evt.person || "Сотрудник", point: evt.point || POINT_NAME[evt.objectId] || "", objectId: evt.objectId || "checkpoint", result: evt.result === "denied" ? "denied" : "allowed" };
    s.passes.unshift(row);
    s.passes.length = Math.min(s.passes.length, 60);
    s.lastFace = row;
    newRows.add(row.id);
    if (row.result === "allowed") {
      bump("passes", 1);
      if (row.objectId === "checkpoint") bump("onSite", /выход/i.test(row.point) ? -1 : 1);
    }
    renderTimeline();
    announce(`${hm(time)}. ${row.person}, ${row.point}: ${resultWord(row)}.`);
  } else if (evt.type === "plate") {
    const vehId = evt.vehicleId || vehByPlate(evt.plate);
    const row = { id: uid(), type: "plate", time, plate: evt.plate || "—", vehicle: evt.vehicle || "машина", objectId: "gate", vehicleId: vehId, result: ["allowed", "not_in_list", "blacklist"].includes(evt.result) ? evt.result : "allowed", direction: evt.direction === "out" ? "out" : "in" };
    s.vehicles.unshift(row);
    s.vehicles.length = Math.min(s.vehicles.length, 60);
    newRows.add(row.id);
    if (row.result === "allowed") {
      // машина, которая уже числится внутри, второй раз не считается
      if (row.direction === "in") { if (!vehId || !s.inside.has(vehId)) bump("vehicles", 1); if (vehId) s.inside.add(vehId); }
      else if (vehId) s.inside.delete(vehId);
    }
    if (row.result === "blacklist") handleEvent({ type: "alarm", time, kind: "blacklist_plate", where: `Въезд · ${row.plate}`, objectId: "gate" });
    announce(`${hm(time)}. Номер ${row.plate}: ${row.result === "allowed" ? (row.direction === "in" ? "въезд разрешён" : "выезд") : row.result === "not_in_list" ? "не пропущен, номера нет в списке" : "чёрный список"}.`);
  } else if (evt.type === "alarm") {
    const row = { id: uid(), type: "alarm", time, kind: evt.kind || "intrusion", where: evt.where || "", objectId: evt.objectId || "perimeter", resolved: false, comment: "" };
    s.alarms.unshift(row);
    s.alarms.length = Math.min(s.alarms.length, 40);
    newRows.add(row.id);
    bump("alarmsOpen", 1);
    if (!state.offscreen) showToast(row);
    announce(`${hm(time)}. Тревога: ${ALARM_LABEL[row.kind] || row.kind}, ${row.where}.`);
    if (!evt.seed) scheduleAutoResolve(state.site, row);
  } else if (evt.type === "door") {
    s.doors[evt.objectId] = evt.state === "open" ? "open" : "closed";
    if (evt.state !== "open") clearTimeout(doorTimers[evt.objectId]);
  }
  renderKpis();
  renderFeed();
  if (evt.type !== "face" || !state.selected || state.selected === evt.objectId) renderDetail();
  tourOn(evt);
}

/* Демо-тревога закрывается сама через 25 с с комментарием охраны, чтобы открытых тревог не копилось.
   Если человек как раз пишет комментарий к ней или демо на паузе, ждём. */
function scheduleAutoResolve(siteId, row) {
  setTimeout(() => {
    if (row.resolved) return;
    const form = document.querySelector(`.dt-alarm[data-alarm="${row.id}"]`);
    const busy = (drafts.get(row.id) || "").trim() || (form && form.contains(document.activeElement));
    if (busy || isPaused()) { scheduleAutoResolve(siteId, row); return; }
    row.resolved = true;
    row.comment = AUTO_COMMENT[row.kind] || "Проверено охраной";
    const s = state.sites[siteId];
    if (siteId === state.site) bump("alarmsOpen", -1);
    else s.kpi.alarmsOpen = Math.max(0, s.kpi.alarmsOpen - 1);
    s.kpi.resolvedToday += 1;
    if (siteId === state.site) {
      renderKpis();
      renderFeed();
      renderDetail();
      announce(`Тревога «${ALARM_LABEL[row.kind] || row.kind}» закрыта. ${row.comment}.`);
    } else renderSiteSwitch();
  }, AUTO_RESOLVE_MS);
}

/* ---------- автотур ----------
 * Если 10 с никто не трогал демо, камера на каждое событие подлетает к его месту (средний план, 1,6 с),
 * держит кадр 5 с и возвращается к общему виду. Любое нажатие или касание отключает тур до следующего простоя. */
const TOUR = { idle: 10000, fly: 1.6, hold: 5000, min: 3000 };
const tour = { active: false, target: null, minUntil: 0, homeTimer: 0 };
let lastInteract = Date.now();
function noteInteraction() { lastInteract = Date.now(); stopTour(); }
function stopTour() { clearTimeout(tour.homeTimer); tour.active = false; tour.target = null; }
function tourHome() {
  clearTimeout(tour.homeTimer);
  tour.homeTimer = setTimeout(() => {
    if (!tour.active) return;
    stopTour();
    if (!state.selected && scene && mode === "3d") { try { scene.resetView({ dur: TOUR.fly }); } catch {} }
  }, TOUR.fly * 1000 + TOUR.hold);
}
function tourOn(evt) {
  if (mode !== "3d" || !scene || typeof scene.tourTo !== "function" || reduced || isPaused() || state.selected) return;
  if (Date.now() - lastInteract < TOUR.idle) return;
  const id = evt.type === "plate" ? "gate" : (evt.type === "face" || evt.type === "alarm") ? evt.objectId : null;
  if (!id) return;
  if (tour.active && tour.target === id) { tourHome(); return; }
  if (Date.now() < tour.minUntil) return;
  tour.active = true;
  tour.target = id;
  tour.minUntil = Date.now() + TOUR.fly * 1000 + TOUR.min;
  try { scene.tourTo(id, { dist: 70, dur: TOUR.fly }); } catch {}
  tourHome();
}

/* ---------- пауза ---------- */
function isPaused() { return state.userPaused || state.offscreen || state.docHidden; }
function applyPause() {
  const p = isPaused();
  if (p && tour.active) { stopTour(); try { if (mode === "3d") scene?.resetView({ dur: 0 }); } catch {} }
  try { scene?.setPaused(p); } catch (e) { console.warn(e); }
  $(".live-pill").classList.toggle("is-paused", p);
  $(".live-pill__label").textContent = p ? "Пауза" : "Демо";
  $("#hud-paused").hidden = !state.userPaused;
  if (poster && poster !== scene) { try { poster.setPaused(true); } catch {} }
  world.classList.toggle("is-paused", p);
  const btn = $("#ctl-pause");
  btn.setAttribute("aria-pressed", String(state.userPaused));
  const label = state.userPaused ? "Запустить демо" : "Остановить демо";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  $("use", btn).setAttribute("href", state.userPaused ? "#i-play" : "#i-pause");
}

/* ---------- запуск сцены ---------- */
function webglOk() {
  try {
    const c = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}
function pickQuality() {
  const conn = navigator.connection || {};
  const phone = phoneMQ.matches || matchMedia("(pointer: coarse)").matches;
  const weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const lowDpr = (window.devicePixelRatio || 1) < 1.25 && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  return phone || conn.saveData || weak || lowDpr ? "low" : "high";
}
function sceneHandlers(getSelf) {
  return {
    onSelect: (id) => { if (scene === getSelf()) setSelected(id, true); },
    onEvent: (evt) => { if (scene === getSelf()) handleEvent(evt); },
  };
}
/* Пока грузится 3D, виден постер — снимок той же 3D-фермы. Схема из fallback.js включается,
   только если 3D недоступна. */
function startFallbackScene() {
  let self = null;
  const h = sceneHandlers(() => self);
  posterEl.classList.add("is-svg");
  posterEl.removeAttribute("aria-hidden");
  self = createFallbackScene(posterEl, { onSelect: h.onSelect, onEvent: h.onEvent, reducedMotion: reduced, simulate: true });
  poster = self;
  scene = self;
  if (SITE.sites[state.site] && state.site !== "north") self.setSite(state.site);
  if (state.selected) self.select(state.selected);
  buildSearchIndex();
  applyPause();
}
function useFallback(reason) {
  if (mode === "fallback") return;
  if (reason) console.info("QazTracker: 3D недоступна, работает схема.", reason);
  mode = "fallback";
  world.dataset.mode = "fallback";
  posterEl.hidden = false;
  startFallbackScene();
  const cap = $(".hero__caption");
  if (cap && !cap.dataset.fallback) {
    cap.dataset.fallback = "1";
    cap.textContent = "В этом браузере трёхмерная сцена недоступна, показываем схему фермы. Демо работает так же: люди, машины и события выдуманы, на точки можно нажимать.";
  }
}
async function boot3D() {
  if (!webglOk()) { useFallback("нет WebGL"); return; }
  let mod;
  try { mod = await import("./scene.js"); }
  catch (e) { useFallback(e); return; }
  if (typeof mod.createFarmScene !== "function") { useFallback("нет createFarmScene"); return; }
  let s3 = null, ready = false, revealed = false;
  const reveal = () => {
    if (revealed || !s3) return;
    revealed = true;
    mode = "3d";
    world.dataset.mode = "3d";
    canvas.style.touchAction = "pan-y";
    setTimeout(() => { canvas.style.touchAction = "pan-y"; }, 600);
    posterEl.setAttribute("aria-hidden", "true");
    setTimeout(() => { try { poster?.dispose(); } catch {} poster = null; posterEl.hidden = true; }, 700);
  };
  let pending = null;
  try {
    const h = sceneHandlers(() => s3);
    pending = Promise.resolve(mod.createFarmScene(canvas, {
      onSelect: h.onSelect,
      onEvent: h.onEvent,
      onReady: () => { ready = true; reveal(); },
      quality: pickQuality(),
      reducedMotion: reduced,
    }));
    s3 = await withTimeout(pending, 25000);
  } catch (e) {
    // сцена, которая всё-таки догрузится после тайм-аута, не должна рисовать невидимо и тратить батарею
    if (pending) pending.then((late) => { try { late?.dispose(); } catch {} }).catch(() => {});
    useFallback(e);
    return;
  }
  // 3D готова: переносим на неё выбор и объект, постер останавливаем
  const prev = poster;
  scene = s3;
  lastInsets = "";
  syncInsets(true);
  watchInsets();
  try { prev?.setPaused(true); } catch {}
  try { if (state.site !== "north") await s3.setSite(state.site); } catch (e) { console.warn(e); }
  try { if (state.selected) s3.select(state.selected); } catch (e) { console.warn(e); }
  applyPause();
  buildSearchIndex();
  if (ready) reveal(); else setTimeout(reveal, 1500);
}

/* колесо мыши прокручивает страницу; приближение — с Ctrl */
let hintTimer = 0, hintShown = 0;
function showHint(text) {
  if (Date.now() - hintShown < 6000) return;
  hintShown = Date.now();
  const el = $("#hud-hint");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, 1800);
}
stage.addEventListener("wheel", (e) => {
  if (mode !== "3d") return;
  if (!(e.ctrlKey || e.metaKey)) { e.stopPropagation(); showHint("Чтобы приблизить, зажмите Ctrl и крутите колесо"); }
}, { capture: true, passive: true });

/* ---------- поиск ---------- */
let searchIndex = [];
let activeIdx = -1;
function buildSearchIndex() {
  const items = [];
  for (const o of objectsList()) {
    const p = SITE.points[o.id];
    const v = veh(o.id);
    const label = p ? p.title : v ? `${v.type.charAt(0).toUpperCase() + v.type.slice(1)}` : o.name;
    const keys = [o.name, label, o.id, KIND_LABEL[o.kind] || ""];
    if (p) p.devices.forEach((d) => keys.push(d.model, d.brand));
    if (v) keys.push(v.plate);
    items.push({ id: o.id, label, plate: v?.plate, kind: v ? v.type : KIND_LABEL[o.kind] || "", icon: KIND_ICON[o.kind] || "search", keys });
  }
  if (!items.some((i) => i.id === "gate")) items.push({ id: "gate", label: "Въезд", kind: "въезд", icon: "gate", keys: ["въезд", "шлагбаум", "DS-TCG406-E"] });
  searchIndex = items;
}
function searchItems(q) {
  const k = normKey(q), kp = normPlate(q);
  if (!k) return [];
  const res = searchIndex.filter((i) => i.keys.some((x) => normKey(x).includes(k) || normPlate(x).includes(kp)));
  // люди из журнала: ведём к точке, где их видели последними
  const seen = new Set(res.map((r) => r.id + r.label));
  for (const r of cur().passes) {
    if (r.result !== "allowed" || r.type !== "face") continue;
    if (!normKey(r.person).includes(k)) continue;
    const key = "p" + r.person;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push({ id: r.objectId, label: r.person, kind: `${POINT_NAME[r.objectId] || r.point}, ${hm(r.time)}`, icon: "user" });
  }
  for (const r of cur().vehicles) {
    if (!normPlate(r.plate).includes(kp) || res.some((x) => x.plate === r.plate)) continue;
    res.push({ id: r.vehicleId && SITE.vehicles[r.vehicleId] ? r.vehicleId : "gate", label: r.plate, plate: r.plate, kind: `${r.vehicle}, ${hm(r.time)}`, icon: "car" });
  }
  return res.slice(0, 8);
}
function renderSearch() {
  const input = $("#search-input"), list = $("#search-results");
  const q = input.value.trim();
  state.query = q;
  if (q) {
    // журнал показывает только подходящие строки; если в текущей вкладке их нет, переключаемся
    const s = cur();
    const hits = (t) => s[t].filter(matches).length;
    if (!hits(state.tab)) { const other = ["passes", "vehicles", "alarms"].find((t) => hits(t)); if (other) setTab(other); }
  }
  renderFeed();
  if (!q) { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); return; }
  const res = searchItems(q);
  activeIdx = res.length ? Math.min(Math.max(activeIdx, 0), res.length - 1) : -1;
  list.innerHTML = res.length
    ? res.map((r, i) => `<li role="option" id="sr-${i}" data-select="${esc(r.id)}" aria-selected="${i === activeIdx}">${icon(r.icon)}<span>${r.plate ? plateHtml(r.plate, "sm") : esc(r.label)}</span><span class="res-kind">${esc(r.kind)}</span></li>`).join("")
    : `<li class="res-empty" role="option" aria-disabled="true">Ничего не найдено</li>`;
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  if (activeIdx >= 0) input.setAttribute("aria-activedescendant", `sr-${activeIdx}`);
}
function closeSearch(clear) {
  const input = $("#search-input");
  $("#search-results").hidden = true;
  input.setAttribute("aria-expanded", "false");
  if (clear) { input.value = ""; state.query = ""; renderFeed(); }
  if (phoneMQ.matches) { $("#hud-search").classList.remove("is-open"); $("#search-toggle").setAttribute("aria-expanded", "false"); }
}

/* ---------- обработчики панели ---------- */
function bindHud() {
  hud.addEventListener("click", (e) => {
    const sel = e.target.closest("[data-select]");
    if (sel && !sel.closest("#search-results")) { setSelected(sel.dataset.select); if (phoneMQ.matches) setFeedOpen(false); return; }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "close") setSelected(null);
    if (act.dataset.act === "open") openDoor(act.dataset.id);
  });
  hud.addEventListener("submit", (e) => {
    const f = e.target.closest(".dt-alarm");
    if (f) { e.preventDefault(); resolveAlarm(f); }
  });
  hud.addEventListener("input", (e) => {
    const f = e.target.closest(".dt-alarm");
    if (f && e.target.tagName === "TEXTAREA") {
      drafts.set(f.dataset.alarm, e.target.value);
      if (e.target.value.trim().length >= 3) { e.target.classList.remove("is-invalid"); e.target.removeAttribute("aria-invalid"); const m = $(".dt-alarm__msg", f); m.classList.remove("is-bad"); m.textContent = "Без комментария тревогу закрыть нельзя."; }
    }
  });
  $("#hud-detail").addEventListener("focusout", () => {
    setTimeout(() => { if (state.detailDirty && !$("#hud-detail").contains(document.activeElement)) renderDetail(); }, 0);
  });
  // пока кнопка мыши или палец зажаты на карточке или журнале, их не перерисовываем: нажатие не потеряется
  let pdTimer = 0;
  hud.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#hud-detail, #hud-feed")) return;
    state.pointerDown = true;
    clearTimeout(pdTimer);
    pdTimer = setTimeout(release, 4000); // на случай, если кнопку отпустили за пределами окна
  });
  const release = () => {
    clearTimeout(pdTimer);
    if (!state.pointerDown) return;
    state.pointerDown = false;
    setTimeout(() => { if (state.feedDirty) renderFeed(); if (state.detailDirty) renderDetail(); }, 0);
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  // подсказка, что карточку и журнал можно прокрутить
  for (const el of [$("#hud-detail"), ...$$(".feed-list")]) el.addEventListener("scroll", updateScrollHints, { passive: true });
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => updateScrollHints());
    ro.observe($("#hud-detail"));
    ro.observe($("#hud-feed"));
  }
  // любое нажатие на демо отключает автотур до следующего простоя
  world.addEventListener("pointerdown", noteInteraction, { capture: true });
  world.addEventListener("keydown", noteInteraction, { capture: true });
  world.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) noteInteraction(); }, { capture: true, passive: true });
  $("#hud-paused-play").addEventListener("click", () => { state.userPaused = false; applyPause(); });

  // вкладки журнала
  const tabs = $(".feed-tabs");
  tabs.addEventListener("click", (e) => { const b = e.target.closest(".feed-tab"); if (b) setTab(b.dataset.tab); });
  tabs.addEventListener("keydown", (e) => {
    const order = ["passes", "vehicles", "alarms"];
    const i = order.indexOf(state.tab);
    if (e.key === "ArrowRight") { e.preventDefault(); setTab(order[(i + 1) % 3], true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setTab(order[(i + 2) % 3], true); }
  });
  $("#feed-handle").addEventListener("click", () => setFeedOpen(!state.feedOpen));

  // кнопки вида
  $(".hud__controls").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ctl]");
    if (!b || !scene) return;
    const c = b.dataset.ctl;
    try {
      if (c === "zoom-in") scene.zoomBy(1);
      if (c === "zoom-out") scene.zoomBy(-1);
      if (c === "rot-l") scene.rotateBy(-45);
      if (c === "rot-r") scene.rotateBy(45);
      if (c === "home") { setSelected(null); scene.resetView(); }
      if (c === "pause") { state.userPaused = !state.userPaused; applyPause(); }
    } catch (err) { console.warn(err); }
  });

  // переключатель объектов
  $("#site-switch-btn").addEventListener("click", () => openSiteList($("#site-switch-list").hidden));
  $("#site-switch-list").addEventListener("click", (e) => { const li = e.target.closest("[data-site]"); if (li) switchSite(li.dataset.site); });
  $("#site-switch-list").addEventListener("keydown", (e) => {
    const items = $$("#site-switch-list [data-site]");
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (i >= 0) switchSite(items[i].dataset.site); }
    if (e.key === "Escape") { openSiteList(false); $("#site-switch-btn").focus(); }
  });

  // поиск
  const input = $("#search-input");
  input.addEventListener("input", () => { activeIdx = 0; renderSearch(); });
  input.addEventListener("focus", () => { if (input.value) renderSearch(); });
  input.addEventListener("keydown", (e) => {
    const items = $$("#search-results [data-select]");
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(items.length - 1, activeIdx + 1); renderSearch(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); renderSearch(); }
    else if (e.key === "Enter") { e.preventDefault(); const it = items[activeIdx] || items[0]; if (it) { setSelected(it.dataset.select); closeSearch(true); } }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearch(true); input.blur(); }
  });
  $("#search-results").addEventListener("mousedown", (e) => e.preventDefault());
  $("#search-results").addEventListener("click", (e) => { const li = e.target.closest("[data-select]"); if (li) { setSelected(li.dataset.select); closeSearch(true); } });
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) { $("#search-results").hidden = true; input.setAttribute("aria-expanded", "false"); } }, 120));
  $("#search-toggle").addEventListener("click", () => {
    const box = $("#hud-search");
    const open = !box.classList.contains("is-open");
    box.classList.toggle("is-open", open);
    $("#search-toggle").setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if (e.key === "/" && !typing && isHeroVisible()) { e.preventDefault(); if (phoneMQ.matches) $("#search-toggle").click(); else input.focus(); }
    if (e.key === "Escape" && !typing) {
      if (!$("#site-switch-list").hidden) openSiteList(false);
      else if (state.selected) setSelected(null);
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.isConnected) return; // элемент только что перерисован
    if (!e.target.closest("#site-switch")) openSiteList(false);
    if (phoneMQ.matches && !e.target.closest("#hud-search")) $("#hud-search").classList.remove("is-open");
  });
}
function setFeedOpen(open) {
  state.feedOpen = open;
  $("#hud-feed").classList.toggle("is-open", open);
  $("#feed-handle").setAttribute("aria-expanded", String(open));
}

function updateScrollHints() {
  for (const el of [$("#hud-detail"), ...$$(".feed-list")]) {
    if (!el) continue;
    el.classList.toggle("is-scrollable", el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }
}
/* короткая подсказка в поиске на узких экранах */
const narrowMQ = matchMedia("(max-width: 1100px)");
function setSearchPlaceholder() {
  $("#search-input").placeholder = narrowMQ.matches ? "Человек или номер" : "Сотрудник, госномер, устройство…";
}

/* ---------- свободная часть кадра для 3D-камеры ----------
 * Панели лежат поверх сцены. Сцене сообщаем, сколько пикселей с каждого края ими закрыто,
 * и она держит ферму (или выбранный объект) в середине оставшейся части. */
let insetsRaf = 0, lastInsets = "";
function shownRect(el) {
  if (!el || el.hidden) return null;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? r : null;
}
function measureInsets() {
  const W = world.getBoundingClientRect();
  if (W.width < 50 || W.height < 50) return null;
  const topBar = shownRect($(".hud__top")), kpis = shownRect($("#hud-kpis"));
  const topEdge = Math.max(topBar ? topBar.bottom : W.top, kpis ? kpis.bottom : W.top);
  const feedEl = $("#hud-feed"), detailEl = $("#hud-detail");
  const out = { top: topEdge - W.top + 6, right: 0, bottom: 0, left: 0 };
  if (phoneMQ.matches) {
    // внизу закрыта полоса журнала (открытый журнал не считаем — он ненадолго), а при выборе — лист с карточкой
    const feed = shownRect(feedEl), handle = $("#feed-handle"), ctl = shownRect($(".hud__controls"));
    let edge = feed ? feed.bottom - (handle.offsetHeight || 46) : W.bottom;
    // строка кнопок вида над журналом тоже закрывает низ сцены
    if (ctl) edge = Math.min(edge, ctl.top);
    if (state.selected) edge = Math.min(edge, W.bottom - 8 - detailEl.offsetHeight);
    out.bottom = W.bottom - edge + 6;
    return out;
  }
  const detail = shownRect(detailEl), feed = shownRect(feedEl), tl = shownRect($("#hud-timeline")), ctl = shownRect($(".hud__controls"));
  const colLeft = Math.min(detail ? detail.left : Infinity, feed && feed.height > W.height * 0.35 ? feed.left : Infinity);
  if (colLeft < Infinity) out.right = W.right - colLeft + 6;
  else {
    if (ctl) out.right = W.right - ctl.left + 6;
    if (feed) out.bottom = W.bottom - feed.top + 6;
  }
  if (tl) out.bottom = Math.max(out.bottom, W.bottom - tl.top + 6);
  // кнопки вида стоят внутри свободной части: подписи сцены их обходят
  if (ctl && colLeft < Infinity) out.avoid = [{ x0: ctl.left - W.left, y0: ctl.top - W.top, x1: ctl.right - W.left, y1: ctl.bottom - W.top }];
  return out;
}
function syncInsets(now) {
  const run = () => {
    insetsRaf = 0;
    if (!scene || typeof scene.setViewInsets !== "function") return;
    const i = measureInsets();
    if (!i) return;
    const key = [i.top, i.right, i.bottom, i.left, ...(i.avoid || []).flatMap((a) => [a.x0, a.y1])].map((v) => Math.round(v / 2)).join(",");
    if (key === lastInsets) return;
    const first = !lastInsets;
    lastInsets = key;
    try { scene.setViewInsets(i, { animate: !first }); } catch (e) { console.warn(e); }
  };
  if (now) { cancelAnimationFrame(insetsRaf); run(); }
  else if (!insetsRaf) insetsRaf = requestAnimationFrame(run);
}
function watchInsets() {
  if (!("ResizeObserver" in window)) { addEventListener("resize", () => syncInsets()); return; }
  const ro = new ResizeObserver(() => syncInsets());
  for (const el of [world, $(".hud__top"), $("#hud-kpis"), $("#hud-detail"), $("#hud-feed"), $("#hud-timeline")]) if (el) ro.observe(el);
}
function isHeroVisible() { return !state.offscreen; }

/* ---------- часы ---------- */
function tickClock() {
  const now = new Date();
  const el = $("#live-clock");
  el.textContent = hm(now);
  el.setAttribute("datetime", now.toISOString());
}

/* ---------- всё вместе ---------- */
function renderAll() {
  renderKpis();
  renderFeed();
  renderTimeline();
  hud.classList.toggle("has-selection", Boolean(state.selected));
  renderDetail(true);
  buildSearchIndex();
}

function observeHero() {
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) state.offscreen = en.intersectionRatio < 0.12;
      applyPause();
    }, { threshold: [0, 0.12, 0.3] });
    io.observe(world);
  }
  document.addEventListener("visibilitychange", () => { state.docHidden = document.hidden; applyPause(); });
}

/* ---------- секции ниже ---------- */
function renderTimesheet() {
  const table = $("#ts-table");
  if (!table) return;
  const days = 30;
  const first = new Date(Date.UTC(2026, 8, 1)).getUTCDay(); // 2 = вторник
  const wd = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const dow = (d) => (first + d - 1) % 7;
  const weekend = (d) => dow(d) === 0 || dow(d) === 6;
  // те же люди, что ходят по демо-ферме и стоят в журнале: имя и должность из SITE.people
  const P = (name) => { const p = SITE.people[name] || { role: "", schedule: "" }; const [first, last] = name.split(" "); return { name: `${last} ${first}`, role: `${p.role} · ${p.schedule}` }; };
  const emp = [
    { ...P("Айгуль Нурланова"), day: (d) => (weekend(d) ? ["В"] : ["Я", 8]) },
    { ...P("Марат Сеитов"), day: (d) => ((d - 1) % 4 === 0 ? ["Я", 16, 2] : (d - 2) % 4 === 0 ? ["Я", 8, 6] : ["В"]), starts: (d) => (d - 1) % 4 === 0 },
    { ...P("Сауле Темирбекова"), day: (d) => (d >= 21 && d <= 24 ? ["Б"] : Math.floor((d - 1) / 2) % 2 === 0 ? ["Я", 11, 1] : ["В"]) },
    { ...P("Бекзат Омаров"), day: (d) => (dow(d) === 0 ? ["В"] : d === 8 ? ["НН"] : d === 15 ? ["НД"] : ["Я", 7]) },
    {
      ...P("Сергей Литвиненко"),
      day: (d) => {
        const st = (x) => x >= 1 && Math.floor((x - 1) / 2) % 2 === 0;
        const h = (st(d) ? 3 : 0) + (st(d - 1) ? 8 : 0), n = (st(d) ? 2 : 0) + (st(d - 1) ? 6 : 0);
        return h ? ["Я", h, n] : ["В"];
      },
      starts: (d) => Math.floor((d - 1) / 2) % 2 === 0,
    },
    { ...P("Олжас Тулегенов"), day: (d) => (d >= 14 && d <= 25 ? ["ОТ"] : d === 26 ? ["РВ", 4] : weekend(d) ? ["В"] : ["Я", 8]) },
  ];
  let head = `<thead><tr><th class="name" scope="col">Сотрудник</th>`;
  for (let d = 1; d <= days; d++) head += `<th scope="col" class="${weekend(d) ? "is-we" : ""}">${d}<span class="wd">${wd[dow(d)]}</span></th>`;
  head += `<th class="tot" scope="col">Явки</th><th class="tot" scope="col">Часы</th><th class="tot" scope="col">Ноч&shy;ные</th></tr></thead>`;
  let body = "<tbody>";
  for (const e of emp) {
    let row = `<tr><th class="name" scope="row"><b>${e.name}</b><span>${e.role}</span></th>`;
    let hours = 0, night = 0, worked = 0;
    for (let d = 1; d <= days; d++) {
      const [code, h, n] = e.day(d);
      if (h) hours += h;
      if (n) night += n;
      if (e.starts ? e.starts(d) && (code === "Я" || code === "РВ") : code === "Я" || code === "РВ") worked += 1;
      row += `<td class="d c-${code}"><b>${code}</b>${h ? `<i>${h}</i>` : ""}${n ? `<em>н${n}</em>` : ""}</td>`;
    }
    row += `<td class="tot">${worked}</td><td class="tot">${hours}</td><td class="tot">${night || "—"}</td></tr>`;
    body += row;
  }
  body += "</tbody>";
  table.insertAdjacentHTML("beforeend", head + body);
  $("#ts-legend").innerHTML = [
    ["Я", "явка"], ["РВ", "работа в выходной"], ["В", "выходной"], ["ОТ", "отпуск"], ["ДО", "отпуск без содержания"], ["Б", "больничный"],
    ["К", "командировка"], ["ПР", "прогул"], ["НН", "неявка по невыясненной причине"], ["НД", "нет отметки входа или выхода"], ["н", "ночные часы"],
  ].map(([c, t]) => `<span><b>${c}</b>${t}</span>`).join("");
}

function bindRemoteDemo() {
  const btn = $("#remote-open"), st = $("#remote-status");
  if (!btn) return;
  let n = 0, timer = 0;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    st.classList.remove("is-ok");
    st.innerHTML = `<span class="spinner" aria-hidden="true"></span>Команда отправлена…`;
    const ms = 860 + ((n++ * 173) % 240);
    setTimeout(() => {
      st.classList.add("is-ok");
      st.innerHTML = `${icon("check")}Команда отправлена → Дверь открыта за ${sec(ms)} с`;
      btn.disabled = false;
      clearTimeout(timer);
      timer = setTimeout(() => { st.classList.remove("is-ok"); st.textContent = "Пример. Нажмите кнопку."; }, 7000);
    }, ms);
  });
}

function bindResolveDemo() {
  const form = $("#resolve-demo");
  if (!form) return;
  const ta = $("#resolve-comment"), msg = $("#resolve-msg"), pill = $("#resolve-pill"), btn = $("button", form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (ta.value.trim().length < 3) {
      ta.classList.add("is-invalid");
      ta.setAttribute("aria-invalid", "true");
      msg.className = "resolve__msg is-bad";
      msg.textContent = "Напишите, что произошло. Без комментария тревогу закрыть нельзя.";
      ta.focus();
      return;
    }
    ta.classList.remove("is-invalid");
    ta.removeAttribute("aria-invalid");
    pill.className = "pill pill--muted";
    pill.textContent = "Решено";
    msg.className = "resolve__msg is-ok";
    msg.textContent = "Тревога закрыта. Комментарий сохранён в журнале.";
    btn.disabled = true;
    ta.readOnly = true;
  });
  ta.addEventListener("input", () => { if (ta.value.trim().length >= 3) { ta.classList.remove("is-invalid"); ta.removeAttribute("aria-invalid"); } });
}

/* ---------- контакты ---------- */
const contactItems = () => {
  const out = [];
  const digits = (s) => String(s).replace(/\D/g, "");
  const pretty = (s) => { const d = digits(s); return d.length === 11 ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : `+${d}`; };
  if (CONTACT.phone) out.push({ key: "phone", icon: "phone", label: "Телефон", text: CONTACT.phone, href: `tel:+${digits(CONTACT.phone).replace(/^8/, "7")}`, copy: true });
  if (CONTACT.whatsapp) out.push({ key: "whatsapp", icon: "chat", label: "WhatsApp", text: pretty(CONTACT.whatsapp), href: `https://wa.me/${digits(CONTACT.whatsapp)}`, ext: true });
  if (CONTACT.telegram) out.push({ key: "telegram", icon: "send", label: "Telegram", text: `@${String(CONTACT.telegram).replace(/^@/, "")}`, href: `https://t.me/${String(CONTACT.telegram).replace(/^@/, "")}`, ext: true });
  if (CONTACT.email) out.push({ key: "email", icon: "mail", label: "Почта", text: CONTACT.email, href: `mailto:${CONTACT.email}`, copy: true });
  return out;
};
function contactLine(c) {
  return `<p class="contact-line">${icon(c.icon)}<span>${c.label}:</span><a href="${esc(c.href)}"${c.ext ? ' target="_blank" rel="noopener"' : ""}>${esc(c.text)}</a>${c.copy ? `<button class="copy-mini" type="button" data-copy="${esc(c.text)}">Скопировать</button>` : ""}</p>`;
}
function renderContacts() {
  const items = contactItems();
  if (!items.length) {
    console.warn("CONTACT пуст — заявку некуда отправить. Заполните js/config.js до публикации.");
    if (/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname)) {
      const block = $("[data-contact-block]");
      block.innerHTML = `<p class="dev-note">${icon("alert")}<span><b>Заполните CONTACT в js/config.js.</b> Без телефона, WhatsApp или Telegram заявку некуда отправить. Эта плашка видна только на localhost.</span></p>`;
      block.hidden = false;
    }
    return;
  }
  const block = $("[data-contact-block]");
  block.innerHTML = items.map(contactLine).join("");
  block.hidden = false;
  const foot = $("[data-contact-footer]");
  foot.innerHTML = items.map(contactLine).join("");
  foot.hidden = false;
  const phone = items.find((c) => c.key === "phone") || items[0];
  const hdr = $("[data-contact-header]");
  hdr.innerHTML = `<a href="${esc(phone.href)}"${phone.ext ? ' target="_blank" rel="noopener"' : ""}>${esc(phone.text)}</a>`;
  hdr.hidden = false;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    copyText(b.dataset.copy).then((ok) => { b.textContent = ok ? "Скопировано" : "Выделите и скопируйте"; setTimeout(() => { b.textContent = "Скопировать"; }, 2500); });
  });
}
function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {}
  return Promise.resolve(false);
}

/* ---------- заявка ---------- */
function bindLeadForm() {
  const form = $("#lead-form");
  const region = $("#f-region");
  region.insertAdjacentHTML("beforeend", SITE.regions.map((r) => `<option>${esc(r)}</option>`).join(""));
  const result = $("#lead-result"), textEl = $("#lead-text"), status = $("#lead-status");
  const err = (id, text) => {
    const input = id === "focus" ? null : $(`#f-${id}`);
    const box = $(`#e-${id}`);
    box.textContent = text || "";
    if (input) { input.classList.toggle("is-invalid", Boolean(text)); if (text) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
    return !text;
  };
  const phoneDigits = (v) => v.replace(/\D/g, "");
  const phoneOk = (v) => { const d = phoneDigits(v); return (d.length === 11 && /^[78]/.test(d)) || (d.length === 10 && d[0] === "7"); };
  const phoneFmt = (v) => { let d = phoneDigits(v); if (d.length === 10) d = "7" + d; d = "7" + d.slice(1); return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`; };
  const validate = () => {
    const v = Object.fromEntries(new FormData(form));
    const focus = $$('input[name="focus"]:checked', form).map((i) => i.value);
    const ok = [
      err("name", (v.name || "").trim().length < 2 ? "Напишите, как к вам обращаться." : ""),
      err("phone", !phoneOk(v.phone || "") ? "Нужен номер Казахстана, например +7 701 123 45 67." : ""),
    ];
    return { ok: ok.every(Boolean), v, focus };
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { ok, v, focus } = validate();
    if (!ok) {
      const firstBad = $(".is-invalid", form) || $('input[name="focus"]', form);
      firstBad?.focus();
      return;
    }
    const text = [
      "Заявка на пилот QazTracker Vision",
      `Имя: ${v.name.trim()}`,
      `Телефон: ${phoneFmt(v.phone)}`,
      (v.org || "").trim() && `Хозяйство или предприятие: ${v.org.trim()}`,
      v.region && `Регион: ${v.region}`,
      v.staff && `Сотрудников: ${v.staff}`,
      focus.length && `Что важнее: ${focus.join(", ")}`,
      (v.note || "").trim() && `Комментарий: ${v.note.trim()}`,
    ].filter(Boolean).join("\n");
    textEl.value = text;
    const actions = [];
    const wa = String(CONTACT.whatsapp || "").replace(/\D/g, "");
    const tg = String(CONTACT.telegram || "").replace(/^@/, "");
    if (wa) actions.push(`<a class="btn btn--primary" href="https://wa.me/${wa}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon("chat")}Отправить в WhatsApp</a>`);
    if (tg) actions.push(`<a class="btn btn--primary" href="https://t.me/${esc(tg)}" target="_blank" rel="noopener" data-tg>${icon("send")}Отправить в Telegram</a>`);
    actions.push(`<button class="btn btn--ghost" type="button" data-lead-copy>${icon("copy")}Скопировать заявку</button>`);
    $("#lead-actions").innerHTML = actions.join("");
    const other = contactItems().filter((c) => c.key === "phone" || c.key === "email");
    let note;
    if (wa || tg) note = `Нажмите кнопку, откроется ${wa && tg ? "мессенджер" : wa ? "WhatsApp" : "Telegram"} с вашей заявкой. Сообщение уйдёт, когда вы нажмёте «Отправить» там.${tg ? " В Telegram текст вставьте сами: мы скопируем его по кнопке." : ""}`;
    else note = "Мы не отправляем заявку автоматически. Скопируйте текст кнопкой ниже.";
    if (other.length) note += " " + other.map((c) => `${c.label}: ${c.text}.`).join(" ");
    $("#lead-result-text").textContent = note;
    status.textContent = "";
    form.hidden = true;
    result.hidden = false;
    result.focus();
  });
  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t.classList.contains("is-invalid")) { t.classList.remove("is-invalid"); t.removeAttribute("aria-invalid"); const id = t.id.replace("f-", ""); const b = $(`#e-${id}`); if (b) b.textContent = ""; }
  });
  form.addEventListener("change", (e) => { if (e.target.tagName === "SELECT" && e.target.value) { e.target.classList.remove("is-invalid"); e.target.removeAttribute("aria-invalid"); $(`#e-${e.target.id.replace("f-", "")}`).textContent = ""; } });
  result.addEventListener("click", (e) => {
    if (e.target.closest("[data-lead-copy]")) {
      copyText(textEl.value).then((ok) => {
        if (ok) status.textContent = "Заявка скопирована. Вставьте её в чат или письмо и отправьте.";
        else { textEl.focus(); textEl.select(); status.textContent = "Текст выделен. Нажмите Ctrl+C или «Копировать» на телефоне."; }
      });
    }
    if (e.target.closest("[data-tg]")) {
      copyText(textEl.value).then((ok) => { status.textContent = ok ? "Текст заявки скопирован. Вставьте его в чат Telegram и отправьте." : "Скопируйте текст заявки из поля выше и вставьте его в чат Telegram."; });
    }
  });
  $("#lead-edit").addEventListener("click", () => { result.hidden = true; form.hidden = false; $("#f-name").focus(); });
}

/* ---------- старт ---------- */
function init() {
  seedHistory();
  tickClock();
  setInterval(tickClock, 5000);
  bindHud();
  setSearchPlaceholder();
  narrowMQ.addEventListener?.("change", setSearchPlaceholder);
  renderAll();
  setTab("passes");
  observeHero();
  applyPause();
  renderTimesheet();
  bindRemoteDemo();
  bindResolveDemo();
  renderContacts();
  bindLeadForm();
  phoneMQ.addEventListener?.("change", () => { closeSearch(false); setFeedOpen(false); });
  // 3D грузим после первой отрисовки, когда главный экран рядом с видимой областью
  const go = () => boot3D().catch((e) => useFallback(e));
  const later = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 200));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); later(go); } }, { rootMargin: "300px" });
    io.observe(world);
  } else later(go);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
