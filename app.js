// ゆくさき（YuQsaki）：画面の操作。しおりはこの端末の中だけ（js/store.js）、リンクに詰めて渡す（js/share.js）
import {
  MAX_DAYS, MAX_ITEMS, addDays, addTrip, cleanItem, currentTrip, dayCount, exportJson, importJson, itemsOf, label,
  load, newId, receiveTrip, removeTrip, restoreTrip, save, stayLabel, touch, updateTrip, ymd
} from "./js/store.js?v=202610231";
import { packTrip, unpackTrip } from "./js/share.js?v=202610231";

const $ = (id) => document.getElementById(id);
const PAGE_URL = "https://katsuan.github.io/yuqsaki/";
const QRONOS_URL = "https://katsuan.github.io/countdown/";
const CARD_COLOR = "#12A0B0"; // ロゴの海の色
const URI_LIMIT = 1000; // LINE のカードのボタンに入れられる URL の長さ
const TRIP_EMOJIS = ["🧳", "✈️", "🏝️", "⛰️", "♨️", "🏕️", "🎡", "🚗", "🚃", "🍜", "👪", "🎒"];
const KINDS = [
  ["📍", "見る"],
  ["🍴", "ごはん"],
  ["☕", "休む"],
  ["🛍️", "買う"],
  ["🏨", "宿"],
  ["🚗", "車"],
  ["🚃", "電車"],
  ["✈️", "飛行機"],
  ["♨️", "温泉"],
  ["🎡", "遊ぶ"]
];
const BRING_IDEAS = ["着がえ", "充電器", "保険証", "常備薬", "歯ブラシ", "タオル", "日焼け止め", "雨具", "エコバッグ", "おやつ", "現金", "ウェットティッシュ"];

let state = load();
const ui = {
  day: 0,
  tripForm: null, // null（出さない）・"new"・"edit"
  tEmoji: TRIP_EMOJIS[0],
  itemForm: false,
  editing: null, // 直している予定の id
  kind: KINDS[0][0],
  justAdded: null,
  shareUrl: "" // いまのしおりを詰めたリンク
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function persist() {
  if (!save(state)) say("この端末に残せませんでした（プライベートブラウズでは、閉じると消えます）");
}

function say(text, undo) {
  if (window.LineShareUI?.toast) {
    window.LineShareUI.toast(text, undo ? { actionLabel: "元に戻す", onAction: undo } : {});
    return;
  }
  $("status").textContent = text;
  clearTimeout(say.timer);
  if (text) say.timer = setTimeout(() => ($("status").textContent = ""), 3500);
}

const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// 旅行の何日目が今日か（旅行中でなければ 0 日目）
function todayIndex(t) {
  const today = ymd();
  if (today < t.start || today > t.end) return 0;
  return dayCount(t.start, today) - 1;
}

// ---- しおりの切りかえ ----
function renderTripBar() {
  const show = state.trips.length >= 1 && !ui.tripForm;
  $("tripBar").hidden = !show;
  if (!show) return;
  $("tripBar").innerHTML =
    state.trips
      .map((t) => `<button class="ls-chip is-small" type="button" aria-pressed="${t.id === state.current}" data-trip="${t.id}">${esc(t.emoji)} ${esc(t.title)}</button>`)
      .join("") + '<button class="ls-chip is-small new-trip" type="button" data-new>＋ 新しいしおり</button>';
}

$("tripBar").addEventListener("click", (e) => {
  if (e.target.closest("[data-new]")) return openTripForm("new");
  const b = e.target.closest("[data-trip]");
  if (!b) return;
  state.current = b.dataset.trip;
  ui.day = todayIndex(currentTrip(state));
  closeItemForm();
  persist();
  render();
});

// ---- しおりを作る・直す ----
function openTripForm(mode) {
  ui.tripForm = mode;
  const t = mode === "edit" ? currentTrip(state) : null;
  $("tTitle").value = t?.title || "";
  ui.tEmoji = t?.emoji || TRIP_EMOJIS[0];
  const start = t?.start || addDays(ymd(), 7);
  $("tStart").value = start;
  $("tEnd").value = t?.end || addDays(start, 1);
  render();
  $("tripForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTripForm() {
  const open = !!ui.tripForm || !state.trips.length;
  $("tripForm").hidden = !open;
  if (!open) return;
  if (!ui.tripForm && !$("tStart").value) {
    $("tStart").value = addDays(ymd(), 7);
    $("tEnd").value = addDays(ymd(), 8);
  }
  $("tripFormHeading").textContent = ui.tripForm === "edit" ? "名前・日にちを直す" : "しおりを作る";
  $("tSave").textContent = ui.tripForm === "edit" ? "✏️ 直す" : "🧳 しおりを作る";
  $("tCancel").hidden = !state.trips.length;
  $("tEmojis").innerHTML = TRIP_EMOJIS.map((e) => `<button class="ls-chip emoji" type="button" role="radio" aria-checked="${e === ui.tEmoji}" data-emoji="${e}">${e}</button>`).join("");
  renderStay();
}

function renderStay() {
  const s = $("tStart").value;
  const e = $("tEnd").value;
  if (!s || !e) return ($("tStay").textContent = "");
  if (e < s) return ($("tStay").textContent = "⚠️ 帰る日が、行く日より前になっています");
  const n = dayCount(s, e);
  $("tStay").textContent = n > MAX_DAYS ? `⚠️ ${MAX_DAYS}日までにしてください` : `${label(s)} 〜 ${label(e)}　${n === 1 ? "日帰り" : `${n - 1}泊${n}日`}`;
}

$("tEmojis").addEventListener("click", (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b) return;
  ui.tEmoji = b.dataset.emoji;
  renderTripForm();
});
$("tStart").addEventListener("change", () => {
  // 行く日を動かしたら、帰る日も同じだけ動かす（泊数はそのまま）
  const s = $("tStart").value;
  const prev = $("tStart").dataset.prev;
  if (s && prev && $("tEnd").value) {
    const n = dayCount(prev, $("tEnd").value);
    if (n >= 1) $("tEnd").value = addDays(s, n - 1);
  } else if (s && (!$("tEnd").value || $("tEnd").value < s)) $("tEnd").value = s;
  $("tStart").dataset.prev = s;
  renderStay();
});
$("tStart").addEventListener("focus", () => ($("tStart").dataset.prev = $("tStart").value));
$("tEnd").addEventListener("change", renderStay);

$("tSave").addEventListener("click", () => {
  const title = $("tTitle").value.trim();
  const start = $("tStart").value;
  const end = $("tEnd").value;
  if (!title) {
    say("行き先・名前を入れてください");
    return $("tTitle").focus();
  }
  if (!start || !end || end < start || dayCount(start, end) > MAX_DAYS) return say("日にちを確かめてください");
  if (ui.tripForm === "edit") {
    const t = currentTrip(state);
    const outside = t.items.filter((it) => it.day >= dayCount(start, end)).length;
    updateTrip(state, t.id, { title, emoji: ui.tEmoji, start, end });
    say(outside ? `✏️ 直しました（はみ出た予定 ${outside} 件は最後の日へ）` : "✏️ 直しました");
  } else {
    addTrip(state, { title, emoji: ui.tEmoji, start, end });
    ui.day = 0;
    say(`🧳 「${title}」のしおりを作りました。予定を足していきましょう`);
  }
  ui.tripForm = null;
  persist();
  render();
});
$("tCancel").addEventListener("click", () => {
  ui.tripForm = null;
  render();
});
$("editTrip").addEventListener("click", () => openTripForm("edit"));

// ---- しおりの見出し ----
function renderHead(t) {
  $("vEmoji").textContent = t.emoji;
  $("vTitle").textContent = t.title;
  $("vDates").textContent = t.start === t.end ? `${label(t.start)}　日帰り` : `${label(t.start)} 〜 ${label(t.end)}　${stayLabel(t)}`;
  const today = ymd();
  const until = dayCount(today, t.start) - 1;
  $("vCount").className = "count";
  if (today < t.start) $("vCount").innerHTML = `あと<b>${until}</b>日`;
  else if (today <= t.end) {
    $("vCount").innerHTML = `<b>${dayCount(t.start, today)}</b>日目`;
    $("vCount").classList.add("is-now");
  } else {
    $("vCount").textContent = "おかえり";
    $("vCount").classList.add("is-past");
  }
  // くろのす（カウントダウン）：出発の日までを数えるページ
  const q = new URLSearchParams({ type: "until", date: t.start, title: `${t.title}まで`, emoji: t.emoji, from: "yuqsaki" });
  $("qronosLink").href = `${QRONOS_URL}?${q}`;
  $("qronosLink").hidden = today > t.start;
}

// ---- 日ごとの予定 ----
function renderDays(t) {
  const n = dayCount(t.start, t.end);
  ui.day = Math.min(ui.day, n - 1);
  const today = ymd();
  $("dayTabs").innerHTML = Array.from({ length: n }, (_, i) => {
    const date = addDays(t.start, i);
    const count = t.items.filter((it) => it.day === i).length;
    return `<button class="ls-tab" type="button" role="tab" aria-selected="${i === ui.day}" data-day="${i}">${i + 1}日目<small>${label(date)}${date === today ? " きょう" : ""}</small>${count ? `<i>${count}</i>` : ""}</button>`;
  }).join("");
  $("dayTabs").hidden = n === 1;

  const list = itemsOf(t, ui.day);
  $("timeline").innerHTML = list.length
    ? list
        .map((it) => {
          const place = it.place || it.title;
          return `<li class="item${it.done ? " is-done" : ""}${it.id === ui.editing ? " is-editing" : ""}${it.id === ui.justAdded ? " is-new" : ""}">
            <span class="time">${it.time || ""}</span>
            <span class="kind" aria-hidden="true">${esc(it.kind)}</span>
            <div class="body">
              <button class="title" type="button" data-edit="${it.id}" aria-label="${esc(it.title)} を直す">${esc(it.title)}</button>
              <a class="place" href="${mapUrl(place)}" target="_blank" rel="noopener">🗺 ${esc(it.place || "地図で見る")}</a>
              ${it.memo ? `<p class="memo">${esc(it.memo)}</p>` : ""}
            </div>
            <button class="done" type="button" data-done="${it.id}" aria-pressed="${it.done}" aria-label="${esc(it.title)} ${it.done ? "済み" : "まだ"}">${it.done ? "✓" : ""}</button>
          </li>`;
        })
        .join("") + '<li class="edit-hint">名前を押すと直せます。右の丸は「行った・済んだ」のしるし</li>'
    : `<li class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">🗺️</span>${ui.day + 1}日目の予定はまだありません</li>`;
  ui.justAdded = null;
  $("addItemBtn").hidden = ui.itemForm;
}

$("dayTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  ui.day = Number(b.dataset.day);
  if (ui.itemForm && !ui.editing) $("iDay").value = ui.day;
  render();
});

$("timeline").addEventListener("click", (e) => {
  const t = currentTrip(state);
  const done = e.target.closest("[data-done]");
  if (done) {
    const it = t.items.find((x) => x.id === done.dataset.done);
    it.done = !it.done;
    persist();
    return render();
  }
  const edit = e.target.closest("[data-edit]");
  if (edit) openItemForm(t.items.find((x) => x.id === edit.dataset.edit));
});

// ---- 予定を足す・直す ----
function openItemForm(it) {
  const t = currentTrip(state);
  ui.itemForm = true;
  ui.editing = it?.id || null;
  ui.kind = it?.kind || KINDS[0][0];
  $("iTime").value = it?.time || "";
  $("iTitle").value = it?.title || "";
  $("iPlace").value = it?.place || "";
  $("iMemo").value = it?.memo || "";
  const n = dayCount(t.start, t.end);
  $("iDay").innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">${i + 1}日目 ${label(addDays(t.start, i)).replace(/（.）/, "")}</option>`).join("");
  $("iDay").value = it ? it.day : ui.day;
  render();
  $("itemForm").scrollIntoView({ behavior: "smooth", block: "center" });
  if (!it) setTimeout(() => $("iTitle").focus({ preventScroll: true }), 300);
}

function closeItemForm() {
  ui.itemForm = false;
  ui.editing = null;
}

function renderItemForm(t) {
  $("itemForm").hidden = !ui.itemForm;
  if (!ui.itemForm) return;
  $("itemFormHeading").textContent = ui.editing ? "✏️ 予定を直す" : "＋ 予定を足す";
  $("iSave").textContent = ui.editing ? "✏️ 直す" : "＋ 足す";
  $("iKinds").innerHTML = KINDS.map(([e, name]) => `<button class="ls-chip kind-chip" type="button" role="radio" aria-checked="${e === ui.kind}" data-kind="${e}"><span>${e}</span><small>${name}</small></button>`).join("");
  $("iMore").hidden = !ui.editing;
  if (ui.editing) {
    const it = t.items.find((x) => x.id === ui.editing);
    if (it) $("iOqrn").href = planUrl(t, it);
  }
}

$("addItemBtn").addEventListener("click", () => {
  if (currentTrip(state).items.length >= MAX_ITEMS) return say(`予定は ${MAX_ITEMS} 件までです`);
  openItemForm(null);
});
$("iKinds").addEventListener("click", (e) => {
  const b = e.target.closest("[data-kind]");
  if (!b) return;
  ui.kind = b.dataset.kind;
  renderItemForm(currentTrip(state));
});
$("iCancel").addEventListener("click", () => {
  closeItemForm();
  render();
});

$("iSave").addEventListener("click", () => {
  const t = currentTrip(state);
  const title = $("iTitle").value.trim();
  if (!title) {
    say("予定を入れてください");
    return $("iTitle").focus();
  }
  const fields = { day: Number($("iDay").value), time: $("iTime").value, kind: ui.kind, title, place: $("iPlace").value, memo: $("iMemo").value };
  const n = dayCount(t.start, t.end);
  if (ui.editing) {
    const it = t.items.find((x) => x.id === ui.editing);
    Object.assign(it, cleanItem({ ...it, ...fields }, n));
    say(`✏️ 「${title}」を直しました`);
  } else {
    const it = cleanItem({ ...fields, id: newId() }, n);
    t.items.push(it);
    ui.justAdded = it.id;
    say(`${it.kind} ${it.day + 1}日目に「${title}」を足しました`);
  }
  ui.day = fields.day;
  touch(t);
  closeItemForm();
  persist();
  render();
});

$("iDelete").addEventListener("click", () => {
  const t = currentTrip(state);
  const i = t.items.findIndex((x) => x.id === ui.editing);
  if (i < 0) return;
  const [it] = t.items.splice(i, 1);
  touch(t);
  closeItemForm();
  persist();
  render();
  say(`🗑 「${it.title}」を消しました`, () => {
    t.items.splice(Math.min(i, t.items.length), 0, it);
    persist();
    render();
  });
});

// おくるんの「場所・予定」（/plan/）：この予定をカレンダーの予定として送る
function planUrl(t, it) {
  const date = addDays(t.start, it.day);
  const q = new URLSearchParams({
    tab: "calendar",
    title: it.title,
    start: it.time ? `${date}T${it.time}` : date,
    header: `${t.emoji} ${t.title}`,
    color: CARD_COLOR.slice(1)
  });
  if (it.time) q.set("minutes", "60");
  if (it.place) q.set("location", it.place);
  q.set("mapUrl", mapUrl(it.place || it.title));
  if (it.memo) q.set("details", it.memo);
  return window.OQRN ? `${window.OQRN.top}/plan/?${q}` : "#";
}

// ---- 持ち物 ----
function renderBring(t) {
  const done = t.bring.filter((b) => b.done).length;
  $("bringMeta").textContent = t.bring.length ? `${done} / ${t.bring.length}` : "";
  $("bringList").innerHTML = t.bring
    .map(
      (b) => `<li class="${b.done ? "is-done" : ""}">
        <label><input type="checkbox" data-bring="${b.id}" ${b.done ? "checked" : ""}><span>${esc(b.name)}</span></label>
        <button class="mini" type="button" data-bdel="${b.id}" aria-label="${esc(b.name)} を消す">✕</button>
      </li>`
    )
    .join("");
  const have = new Set(t.bring.map((b) => b.name));
  $("bIdeas").innerHTML = BRING_IDEAS.filter((n) => !have.has(n))
    .map((n) => `<button class="ls-chip is-small" type="button" data-bidea="${esc(n)}">＋ ${esc(n)}</button>`)
    .join("");
  $("bClear").hidden = !done;
}

function addBring(name) {
  const t = currentTrip(state);
  name = name.trim().slice(0, 30);
  if (!name || t.bring.some((b) => b.name === name)) return;
  t.bring.push({ id: newId(), name, done: false });
  touch(t);
  persist();
  render();
}
$("bAdd").addEventListener("click", () => {
  addBring($("bName").value);
  $("bName").value = "";
});
$("bName").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    addBring($("bName").value);
    $("bName").value = "";
  }
});
$("bIdeas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-bidea]");
  if (b) addBring(b.dataset.bidea);
});
$("bringList").addEventListener("change", (e) => {
  const box = e.target.closest("[data-bring]");
  if (!box) return;
  const t = currentTrip(state);
  t.bring.find((b) => b.id === box.dataset.bring).done = box.checked;
  persist();
  render();
});
$("bringList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-bdel]");
  if (!del) return;
  const t = currentTrip(state);
  const i = t.bring.findIndex((b) => b.id === del.dataset.bdel);
  const [b] = t.bring.splice(i, 1);
  touch(t);
  persist();
  render();
  say(`🗑 「${b.name}」を消しました`, () => {
    t.bring.splice(Math.min(i, t.bring.length), 0, b);
    persist();
    render();
  });
});
$("bClear").addEventListener("click", () => {
  currentTrip(state).bring.forEach((b) => (b.done = false));
  persist();
  render();
});

// ---- みんなに渡す ----
async function renderShare(t) {
  const packed = await packTrip(t);
  ui.shareUrl = `${PAGE_URL}#s=${packed}`;
  const lines = Array.from({ length: dayCount(t.start, t.end) }, (_, i) => {
    const names = itemsOf(t, i).map((it) => `${it.time ? it.time + " " : ""}${it.title}`);
    return names.length ? `【${i + 1}日目 ${label(addDays(t.start, i))}】\n${names.slice(0, 6).join("\n")}${names.length > 6 ? `\nほか ${names.length - 6} 件` : ""}` : "";
  }).filter(Boolean);
  // カードのボタンは、しおりのリンクが長すぎなければ「しおりを開く」、長ければゆくさきのページ
  const fits = ui.shareUrl.length <= URI_LIMIT;
  const params = new URLSearchParams({
    headerTitle: `${t.emoji} 旅のしおり`,
    title: t.title,
    date: t.start === t.end ? label(t.start) : `${label(t.start)} 〜 ${label(t.end)}`,
    showDate: "true",
    detail: (lines.join("\n\n") || "予定はこれから").slice(0, 300),
    theme: "custom",
    customColor: CARD_COLOR,
    showAction: "true",
    actionLabel: fits ? "🧳 しおりを開く" : "🧳 ゆくさきを開く",
    actionUrl: fits ? ui.shareUrl : PAGE_URL,
    from: "yuqsaki"
  });
  $("cardBtn").href = window.OQRN ? window.OQRN.cardUrl(params) : "#";
  $("cardNote").hidden = fits;
  $("cardNote").textContent = "※ しおりが長いので、カードのボタンからはしおりを開けません。「🔗 しおりのリンクを送る」もいっしょに送ってください。";
}

$("shareBtn").addEventListener("click", async () => {
  const t = currentTrip(state);
  if (!ui.shareUrl) await renderShare(t);
  const text = `${t.emoji} ${t.title}（${label(t.start)}${t.start === t.end ? "" : ` 〜 ${label(t.end)}`}）のしおり`;
  if (navigator.share) {
    try {
      await navigator.share({ title: text, text, url: ui.shareUrl });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${ui.shareUrl}`);
    say("🔗 しおりのリンクをコピーしました。LINE などに貼りつけて送ってください");
  } catch {
    window.LineShareUI?.ask?.({ title: "長押ししてコピーしてください", input: ui.shareUrl, readonly: true, ok: "閉じる", cancel: null });
  }
});

// ---- 控え・消す ----
$("exportBtn").addEventListener("click", async () => {
  const file = new File([exportJson(state)], `yuqsaki-${ymd()}.json`, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "ゆくさきのしおりの控え" });
    } catch {
      // やめたときは何もしない
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say("⬇️ 控えを書き出しました");
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const added = importJson(state, await file.text());
    persist();
    render();
    say(`⬆️ 控えを読みこみました（しおりが ${added} つふえました）`);
  } catch {
    say("読みこめませんでした（ゆくさきで書き出した控えか確かめてください）");
  }
});

$("deleteTrip").addEventListener("click", () => {
  const trash = removeTrip(state, state.current);
  if (!trash) return;
  closeItemForm();
  ui.day = 0;
  persist();
  render();
  say(`🗑 「${trash.trip.title}」のしおりを消しました`, () => {
    restoreTrip(state, trash);
    persist();
    render();
  });
});

// ---- リンクで受けとったしおり（#s=...） ----
async function receiveFromHash() {
  const m = location.hash.match(/^#s=([\w-]+)$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const incoming = await unpackTrip(m[1]);
    const mine = state.trips.find((t) => t.id === incoming.id);
    // 自分の端末のほうが新しければ、上書きしない（自分で直したばかりなど）
    if (mine && mine.upd >= Number(incoming.upd)) {
      state.current = mine.id;
      persist();
      render();
      say(`📩 「${mine.title}」は、この端末のほうが新しいので、そのまま開きました`);
      return;
    }
    const snap = JSON.stringify(state);
    const got = receiveTrip(state, incoming);
    if (!got) throw new Error("bad");
    // 済み・持ち物のチェックは自分のものを残す
    if (got.before) {
      const doneItems = new Set(got.before.items.filter((x) => x.done).map((x) => x.id));
      const doneBring = new Set(got.before.bring.filter((x) => x.done).map((x) => x.id));
      got.trip.items.forEach((x) => (x.done = doneItems.has(x.id)));
      got.trip.bring.forEach((x) => (x.done = doneBring.has(x.id)));
    }
    ui.day = todayIndex(got.trip);
    persist();
    render();
    say(got.before ? `📩 「${got.trip.title}」を新しい内容にしました` : `📩 「${got.trip.title}」のしおりを受けとりました`, () => {
      state = JSON.parse(snap);
      persist();
      render();
    });
  } catch {
    say("しおりのリンクが読めませんでした（リンクが途中で切れていないか確かめてください）");
  }
}

// ---- まとめて描く ----
function render() {
  const t = currentTrip(state);
  renderTripBar();
  renderTripForm();
  $("tripView").hidden = !t || !!ui.tripForm;
  if (!t || ui.tripForm) return;
  renderHead(t);
  renderDays(t);
  renderItemForm(t);
  renderBring(t);
  ui.shareUrl = "";
  renderShare(t);
}

window.addEventListener("hashchange", receiveFromHash);
const first = currentTrip(state);
if (first) ui.day = todayIndex(first);
render();
receiveFromHash();
