// ゆくさき：しおりの保存（この端末の localStorage の "yuqsaki:v1" だけ。サーバーには送らない）
// しおり 1つ = { id, title, emoji, start: "YYYY-MM-DD", end: "YYYY-MM-DD", items: [...], bring: [...], upd }
//   予定 1件 = { id, day: 0〜（何日目−1）, time: "HH:MM" か "", kind: 絵文字, title, place, memo, done }
//   持ち物 1件 = { id, name, done }
// current：いま開いているしおりの id

const KEY = "yuqsaki:v1";
export const MAX_DAYS = 14;
export const MAX_ITEMS = 120;
export const MAX_BRING = 80;
// "YYYY-MM-DD" の形で、ほんとうにある日か（2月30日・13月などは false）
export function isDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// id は画面のボタンにも入れるので、英数字だけ（ちがう形なら新しく作る。共有リンクで受けとった中身も同じ）
const ID = /^[a-z0-9]{4,20}$/;
const cleanId = (v) => (ID.test(String(v ?? "")) ? String(v) : newId());
export const MAX_TRIPS = 50;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 控えのファイルは 2MB まで

// 同じ id が重なったら、あとのほうを新しくする
function uniqueIds(list) {
  const seen = new Set();
  list.forEach((x) => {
    if (seen.has(x.id)) x.id = newId();
    seen.add(x.id);
  });
  return list;
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blank() {
  return { v: 1, trips: [], current: null };
}

// 文字を n 字（UTF-16）までに切る。絵文字が半分に切れて残らないように
export function str(v, n) {
  const s = String(v ?? "").trim().slice(0, n);
  return /[\uD800-\uDBFF]$/.test(s) ? s.slice(0, -1) : s;
}

export function cleanItem(it, days) {
  return {
    id: cleanId(it.id),
    day: Math.min(Math.max(0, Math.floor(Number(it.day) || 0)), Math.max(0, days - 1)),
    time: TIME.test(it.time) ? it.time : "",
    kind: str(it.kind, 8) || "📍",
    title: str(it.title, 40),
    place: str(it.place, 80),
    memo: str(it.memo, 200),
    done: it.done === true
  };
}

export function cleanTrip(t) {
  if (!t || typeof t !== "object") return null;
  const start = isDate(t.start) ? t.start : null;
  if (!start) return null;
  let end = isDate(t.end) && t.end >= start ? t.end : start;
  if (dayCount(start, end) > MAX_DAYS) end = addDays(start, MAX_DAYS - 1);
  const days = dayCount(start, end);
  return {
    id: cleanId(t.id),
    title: str(t.title, 30) || "たびのしおり",
    emoji: str(t.emoji, 8) || "🧳",
    start,
    end,
    items: uniqueIds((Array.isArray(t.items) ? t.items : []).filter((it) => it && typeof it === "object" && str(it.title, 40)).slice(0, MAX_ITEMS).map((it) => cleanItem(it, days))),
    bring: uniqueIds((Array.isArray(t.bring) ? t.bring : []).filter((b) => b && typeof b === "object" && str(b.name, 30)).slice(0, MAX_BRING).map((b) => ({ id: cleanId(b.id), name: str(b.name, 30), done: b.done === true }))),
    upd: Number(t.upd) || Date.now()
  };
}

function clean(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  s.trips = uniqueIds((Array.isArray(raw.trips) ? raw.trips : []).slice(0, MAX_TRIPS).map(cleanTrip).filter(Boolean));
  s.current = s.trips.some((t) => t.id === raw.current) ? raw.current : s.trips[0]?.id || null;
  return s;
}

export function load() {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return blank();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---- 日付 ----
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export function ymd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function dayCount(start, end) {
  return Math.round((toDate(end) - toDate(start)) / 86400000) + 1;
}
export function label(s) {
  const d = toDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
}
// 「11/1（日）」「11/1（日） 〜 11/3（火）」
export function rangeLabel(t) {
  return t.start === t.end ? label(t.start) : `${label(t.start)} 〜 ${label(t.end)}`;
}
// 「2泊3日」「日帰り」
export function stayLabel(t) {
  const n = dayCount(t.start, t.end);
  return n === 1 ? "日帰り" : `${n - 1}泊${n}日`;
}

// ---- しおり ----
export function currentTrip(state) {
  return state.trips.find((t) => t.id === state.current) || null;
}

export function addTrip(state, t) {
  const trip = cleanTrip({ ...t, id: newId(), items: [], bring: [], upd: Date.now() });
  state.trips.unshift(trip);
  state.current = trip.id;
  return trip;
}

// 日にちを変えたとき、はみ出た予定は最後の日へ寄せる
export function updateTrip(state, id, fields) {
  const t = state.trips.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, cleanTrip({ ...t, ...fields }), { upd: Date.now() });
  return t;
}

export function removeTrip(state, id) {
  const i = state.trips.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [trip] = state.trips.splice(i, 1);
  if (state.current === id) state.current = state.trips[0]?.id || null;
  return { trip, index: i };
}

export function restoreTrip(state, trash) {
  if (!trash || state.trips.some((x) => x.id === trash.trip.id)) return;
  state.trips.splice(Math.min(trash.index, state.trips.length), 0, trash.trip);
  state.current = trash.trip.id;
}

export function touch(trip) {
  trip.upd = Date.now();
}

// 1日の予定：時刻のあるものは時刻順、時刻のないものは入れた順で後ろ
export function itemsOf(trip, day) {
  const list = trip.items.filter((it) => it.day === day);
  const timed = list.filter((it) => it.time).sort((a, b) => a.time.localeCompare(b.time));
  return [...timed, ...list.filter((it) => !it.time)];
}

// ---- そらくる（天気）で開く ----
// その日の行き先と日にち（と最初の予定の時刻）で、そらくるを開くための中身。行き先は：
//   その日の予定の場所（最初のもの）→ しおりのどこかの予定の場所 → しおりの名前のはじめのことば（例：「沖縄 家族旅行」→ 沖縄）
// 行き先がわからなければ null。そらくるは場所を国土地理院（施設・住所）→ 市や町の名前の順に探し、なければ alt で探す
export function weatherSpot(trip, day) {
  const items = itemsOf(trip, day);
  const anyPlace = (list) => (list.find((it) => it.place && it.place.trim()) || {}).place;
  const word = (String(trip.title || "").trim().split(/[\s\u3000・、,]+/)[0] || "").slice(0, 40);
  const place = (anyPlace(items) || anyPlace(trip.items) || word || "").trim().slice(0, 40);
  if (!place) return null;
  const first = items.find((it) => /^\d{2}:\d{2}$/.test(it.time || ""));
  // alt：場所が見つからなかったときの代わり（しおりの名前のはじめのことば）
  return { place, alt: word && word !== place ? word : "", date: addDays(trip.start, day), hour: first ? Number(first.time.slice(0, 2)) : null };
}

// ---- 受けとったしおり ----
// 同じしおり（id）がこの端末にあれば、届いたほうが新しいときだけ上書き（済み・持ち物のチェックは自分のものを残す）
// 返すもの：{ trip, before }（before＝上書きする前のしおり。なければ null）／{ trip, kept: true }（この端末のほうが新しい）
//          ／{ full: true }（しおりがいっぱい）／null（読めない）
export function receiveTrip(state, incoming) {
  const t = cleanTrip(incoming);
  if (!t) return null;
  const i = state.trips.findIndex((x) => x.id === t.id);
  const before = i >= 0 ? state.trips[i] : null;
  if (before && before.upd >= t.upd) {
    state.current = before.id;
    return { trip: before, kept: true };
  }
  if (before) {
    const doneItems = new Set(before.items.filter((x) => x.done).map((x) => x.id));
    const doneBring = new Set(before.bring.filter((x) => x.done).map((x) => x.id));
    t.items.forEach((x) => (x.done = doneItems.has(x.id)));
    t.bring.forEach((x) => (x.done = doneBring.has(x.id)));
    state.trips[i] = t;
  } else {
    if (state.trips.length >= MAX_TRIPS) return { full: true };
    state.trips.unshift(t);
  }
  state.current = t.id;
  return { trip: t, before };
}

// ---- 控え ----
export function exportJson(state) {
  return JSON.stringify({ app: "yuqsaki", exportedAt: new Date().toISOString(), ...state }, null, 1);
}

export function importJson(state, text) {
  if (String(text).length > MAX_IMPORT_BYTES) throw new Error("too large");
  const incoming = clean(JSON.parse(text));
  let added = 0;
  incoming.trips.forEach((t) => {
    const i = state.trips.findIndex((x) => x.id === t.id);
    if (i < 0) {
      if (state.trips.length >= MAX_TRIPS) return;
      state.trips.push(t);
      added++;
    } else if (t.upd > state.trips[i].upd) {
      state.trips[i] = t;
    }
  });
  if (!state.current) state.current = state.trips[0]?.id || null;
  return added;
}
