// ゆくさき：しおりの保存（この端末の localStorage の "yuqsaki:v1" だけ。サーバーには送らない）
// しおり 1つ = { id, title, emoji, start: "YYYY-MM-DD", end: "YYYY-MM-DD", items: [...], bring: [...], upd }
//   予定 1件 = { id, day: 0〜（何日目−1）, time: "HH:MM" か "", kind: 絵文字, title, place, memo, done }
//   持ち物 1件 = { id, name, done }
// current：いま開いているしおりの id

const KEY = "yuqsaki:v1";
export const MAX_DAYS = 14;
export const MAX_ITEMS = 120;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blank() {
  return { v: 1, trips: [], current: null };
}

const str = (v, n) => String(v ?? "").trim().slice(0, n);

export function cleanItem(it, days) {
  return {
    id: str(it.id, 20) || newId(),
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
  const start = DATE.test(t.start) ? t.start : null;
  if (!start) return null;
  let end = DATE.test(t.end) && t.end >= start ? t.end : start;
  if (dayCount(start, end) > MAX_DAYS) end = addDays(start, MAX_DAYS - 1);
  const days = dayCount(start, end);
  return {
    id: str(t.id, 20) || newId(),
    title: str(t.title, 30) || "たびのしおり",
    emoji: str(t.emoji, 8) || "🧳",
    start,
    end,
    items: (Array.isArray(t.items) ? t.items : []).filter((it) => it && str(it.title, 40)).map((it) => cleanItem(it, days)).slice(0, MAX_ITEMS),
    bring: (Array.isArray(t.bring) ? t.bring : []).filter((b) => b && str(b.name, 30)).map((b) => ({ id: str(b.id, 20) || newId(), name: str(b.name, 30), done: b.done === true })).slice(0, 80),
    upd: Number(t.upd) || Date.now()
  };
}

function clean(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  s.trips = (Array.isArray(raw.trips) ? raw.trips : []).map(cleanTrip).filter(Boolean);
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

// ---- 受けとったしおり ----
// 同じしおり（id）がこの端末にあれば、新しいほうで上書き。戻すための控えを返す
export function receiveTrip(state, incoming) {
  const t = cleanTrip(incoming);
  if (!t) return null;
  const i = state.trips.findIndex((x) => x.id === t.id);
  const before = i >= 0 ? state.trips[i] : null;
  if (before) state.trips[i] = t;
  else state.trips.unshift(t);
  state.current = t.id;
  return { trip: t, before };
}

// ---- 控え ----
export function exportJson(state) {
  return JSON.stringify({ app: "yuqsaki", exportedAt: new Date().toISOString(), ...state }, null, 1);
}

export function importJson(state, text) {
  const incoming = clean(JSON.parse(text));
  let added = 0;
  incoming.trips.forEach((t) => {
    const i = state.trips.findIndex((x) => x.id === t.id);
    if (i < 0) {
      state.trips.push(t);
      added++;
    } else if (t.upd > state.trips[i].upd) {
      state.trips[i] = t;
    }
  });
  if (!state.current) state.current = state.trips[0]?.id || null;
  return added;
}
