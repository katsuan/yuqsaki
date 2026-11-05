// ゆくさき（YuQsaki）：画面の操作。しおりはこの端末の中だけ（js/store.js）、リンクに詰めて渡す（js/link.js）、送るカードは js/card.js
// 読まれるところ：index.html（画面の入口。部品は js/ から読む）
import {
  MAX_BRING, MAX_DAYS, MAX_IMPORT_BYTES, MAX_ITEMS, addDays, addTrip, cleanItem, currentTrip, dayCount, exportJson, importJson, itemsOf, label,
  load, newId, rangeLabel, receiveTrip, weatherSpot, removeTrip, restoreTrip, save, stayLabel, str, touch, updateTrip, ymd
} from "./js/store.js?v=202611012034";
import { mapUrl, packTrip, qronosUrl, soraqruUrl, tripUrl, unpackTrip } from "./js/link.js?v=202611012034";
import { planQuery, tripCard } from "./js/card.js?v=202611012034";
import {
  KINDS, TRIP_EMOJIS, bringIdeasHtml, bringListHtml, countView, dayOptionsHtml, dayTabsHtml, firstMark, iconHtml, markItemsHtml, timelineHtml, tripBarHtml
} from "./js/view.js?v=202611012034";

const $ = (id) => document.getElementById(id);

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


// いまのしおりを端末に残す。残せなかったら知らせる
function persist() {
  if (!save(state)) say("この端末に残せませんでした（プライベートブラウズでは、閉じると消えます）");
}

// 季節の絵文字をときどき文の後ろに（Q キットの season.js。まだ読めていなければ、そのまま）
const cheer = (text) => (window.QSeason ? window.QSeason.decorate(text) : text);

// 下に短い知らせを出す（undo があれば「元に戻す」ボタンつき）
function say(text, undo) {
  if (window.LineShareUI?.toast) {
    window.LineShareUI.toast(text, undo ? { actionLabel: "元に戻す", onAction: undo } : {});
    return;
  }
  $("status").textContent = text;
  clearTimeout(say.timer);
  if (text) say.timer = setTimeout(() => ($("status").textContent = ""), 3500);
}

// 消して、トーストの「元に戻す」で同じ場所に戻せるようにする（予定・持ち物）。消したものの名前で知らせる
function removeWithUndo(t, list, i, name) {
  const [gone] = list.splice(i, 1);
  touch(t);
  persist();
  render();
  say(`「${name(gone)}」を消しました`, () => {
    list.splice(Math.min(i, list.length), 0, gone);
    persist();
    render();
  });
}

// ---- しるし（しおりの名前・予定の入力枠の中の左。Q キットの pickField） ----
// 押したとき・文字を入れているあいだは、下に選べるしるし。カスタムの欄には好きな絵文字を1つ
const MARK_PICKS = {
  trip: { field: "tTitleField", button: "tEmojiBtn", input: "tTitle", picker: "tEmojis", now: "tEmojiNow", custom: "tEmojiCustom", items: "tEmojiItems", choices: TRIP_EMOJIS.map((e) => [e]), className: "" },
  kind: { field: "iTitleField", button: "iKindBtn", input: "iTitle", picker: "iKinds", now: "iKindNow", custom: "iKindCustom", items: "iKindItems", choices: KINDS, className: "kind-item" }
};

// しるしの欄の動き：候補を押す・カスタムに入れる → set(しるし) して描きなおす（rerender）
function setupMarkPick(c, set, rerender) {
  const pick = window.LineShareUI?.pickField?.({ field: $(c.field), button: $(c.button), input: $(c.input), picker: $(c.picker) }) || null;
  // Q キットが古い・読めないときは、押して開く・たたむだけ
  if (!pick) $(c.button).addEventListener("click", () => ($(c.picker).hidden = !$(c.picker).hidden));
  $(c.picker).addEventListener("click", (e) => {
    const b = e.target.closest("[data-mark]");
    if (!b) return;
    set(b.dataset.mark);
    $(c.custom).value = "";
    rerender();
    // 選んだらたたむ（文字を入れているあいだは開いたまま）
    if (document.activeElement !== $(c.input)) pick ? pick.close() : ($(c.picker).hidden = true);
  });
  // カスタム：入れた絵文字の1つめを、しるしにする（英数字などは使わない）。押しただけでも、前に入れたものを選ぶ
  ["input", "focus"].forEach((type) =>
    $(c.custom).addEventListener(type, () => {
      const mark = firstMark($(c.custom).value);
      if (!mark) return;
      set(mark);
      rerender();
    })
  );
}

// しるしの欄を描く（いまのしるし・候補。カスタムのしるしなら、カスタムの欄にも出す）
function renderMarkPick(c, mark) {
  $(c.now).textContent = mark;
  $(c.button).setAttribute("aria-label", `しるしを選ぶ（いま：${mark}）`);
  const custom = !c.choices.some(([e]) => e === mark);
  $(c.custom).classList.toggle("is-selected", custom);
  if (custom && document.activeElement !== $(c.custom)) $(c.custom).value = mark;
  $(c.items).innerHTML = markItemsHtml(c.choices, mark, c.className);
}


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
  $("tripBar").innerHTML = tripBarHtml(state.trips, state.current);
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
  $("tStart").value = $("tStart").dataset.prev = start;
  $("tEnd").value = t?.end || addDays(start, 1);
  $("tTitleError").hidden = true;
  render();
  $("tripForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// しおりを作る・直す欄を描く（しおりがないときは、いつも出す）
function renderTripForm() {
  const open = !!ui.tripForm || !state.trips.length;
  $("tripForm").hidden = !open;
  if (!open) return;
  if (!ui.tripForm && !$("tStart").value) {
    $("tStart").value = $("tStart").dataset.prev = addDays(ymd(), 7);
    $("tEnd").value = addDays(ymd(), 8);
  }
  $("tripFormHeading").textContent = ui.tripForm === "edit" ? "名前・日にちを直す" : "しおりを作る";
  $("tSave").innerHTML = ui.tripForm === "edit" ? `${iconHtml("edit")}直す` : `${iconHtml("add")}しおりを作る`;
  $("tCancel").hidden = !state.trips.length;
  renderMarkPick(MARK_PICKS.trip, ui.tEmoji);
  renderStay();
}

// 日にちのまちがいを、注意のアイコンつきで出す
function warnStay(text) {
  const mark = Object.assign(document.createElement("span"), { className: "ls-icon" });
  mark.dataset.icon = "warn";
  mark.setAttribute("aria-hidden", "true");
  $("tStay").replaceChildren(mark, text);
}

// 行く日・帰る日の下に「2泊3日」などと、まちがいを出す
function renderStay() {
  const s = $("tStart").value;
  const e = $("tEnd").value;
  if (!s || !e) return ($("tStay").textContent = "");
  if (e < s) return warnStay("帰る日が、行く日より前になっています");
  const n = dayCount(s, e);
  const t = { start: s, end: e };
  if (n > MAX_DAYS) return warnStay(`${MAX_DAYS}日までにしてください`);
  $("tStay").textContent = `${rangeLabel(t)}　${stayLabel(t)}`;
}

setupMarkPick(MARK_PICKS.trip, (mark) => (ui.tEmoji = mark), renderTripForm);
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
$("tTitle").addEventListener("input", () => ($("tTitleError").hidden = true));

$("tSave").addEventListener("click", () => {
  const title = $("tTitle").value.trim();
  const start = $("tStart").value;
  const end = $("tEnd").value;
  $("tTitleError").hidden = !!title;
  if (!title) return $("tTitle").focus();
  if (!start || !end || end < start || dayCount(start, end) > MAX_DAYS) return say("日にちを確かめてください");
  if (ui.tripForm === "edit") {
    const t = currentTrip(state);
    const outside = t.items.filter((it) => it.day >= dayCount(start, end)).length;
    updateTrip(state, t.id, { title, emoji: ui.tEmoji, start, end });
    say(outside ? `直しました（はみ出た予定 ${outside} 件は最後の日へ）` : "直しました");
  } else {
    addTrip(state, { title, emoji: ui.tEmoji, start, end });
    ui.day = 0;
    say(cheer(`「${title}」のしおりを作りました。予定を足していきましょう`));
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
  // 日付・泊数のかたまりごとに折り返す
  const parts = t.start === t.end ? [label(t.start), stayLabel(t)] : [label(t.start), `〜 ${label(t.end)}`, stayLabel(t)];
  $("vDates").replaceChildren(
    ...parts.flatMap((text, i) => {
      const span = document.createElement("span");
      span.textContent = text;
      return i ? [" ", span] : [span];
    })
  );
  const today = ymd();
  const count = countView(t, today);
  $("vCount").className = `count${count.cls ? ` ${count.cls}` : ""}`;
  $("vCount").innerHTML = count.html; // qcheck-ok: W1 数と決まった言葉だけ（js/view.js の countView）
  // くろのす（カウントダウン）：出発の日までを数えるページ
  $("qronosLink").href = qronosUrl(t);
  $("qronosLink").hidden = today > t.start;
  // そらくる：えらんでいる日の行き先の天気（16日先まで見られる。過ぎた日は出さない）
  const spot = weatherSpot(t, ui.day);
  const link = $("soraqruLink");
  link.hidden = !spot || spot.date < today;
  if (!link.hidden) {
    link.href = soraqruUrl(spot);
    $("soraqruWhen").textContent = `${ui.day + 1}日目・${spot.place}`;
  }
}

// ---- 日ごとの予定 ----
function renderDays(t) {
  $("dayTabs").innerHTML = dayTabsHtml(t, ui.day, ymd());
  $("dayTabs").hidden = dayCount(t.start, t.end) === 1;

  $("timeline").innerHTML = timelineHtml(itemsOf(t, ui.day), mapUrl, { day: ui.day, editing: ui.editing, justAdded: ui.justAdded });
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
    if (!it) return render();
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
  $("iTitleError").hidden = true;
  $("iDay").innerHTML = dayOptionsHtml(t);
  $("iDay").value = it ? it.day : ui.day;
  render();
  $("itemForm").scrollIntoView({ behavior: "smooth", block: "center" });
  if (!it) setTimeout(() => $("iTitle").focus({ preventScroll: true }), 300);
}

// 予定の欄を閉じる（直していた予定も忘れる）
function closeItemForm() {
  ui.itemForm = false;
  ui.editing = null;
}

// 予定を足す・直す欄を描く（直すときは「この予定をカードでおくるん」のリンクも）
function renderItemForm(t) {
  $("itemForm").hidden = !ui.itemForm;
  if (!ui.itemForm) return;
  $("itemFormHeading").innerHTML = ui.editing ? `${iconHtml("edit")}予定を直す` : `${iconHtml("add")}予定を足す`;
  $("iSave").innerHTML = ui.editing ? `${iconHtml("edit")}直す` : `${iconHtml("add")}足す`;
  // しるし：予定の入力枠の中の左（しおりの名前と同じ形）
  renderMarkPick(MARK_PICKS.kind, ui.kind);
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
setupMarkPick(MARK_PICKS.kind, (mark) => (ui.kind = mark), () => renderItemForm(currentTrip(state)));
$("iTitle").addEventListener("input", () => ($("iTitleError").hidden = true));
$("iCancel").addEventListener("click", () => {
  closeItemForm();
  render();
});

$("iSave").addEventListener("click", () => {
  const t = currentTrip(state);
  const title = $("iTitle").value.trim();
  $("iTitleError").hidden = !!title;
  if (!title) return $("iTitle").focus();
  const fields = { day: Number($("iDay").value), time: $("iTime").value, kind: ui.kind, title, place: $("iPlace").value, memo: $("iMemo").value };
  const n = dayCount(t.start, t.end);
  const editing = ui.editing && t.items.find((x) => x.id === ui.editing);
  if (editing) {
    Object.assign(editing, cleanItem({ ...editing, ...fields }, n));
    say(`「${title}」を直しました`);
  } else {
    if (t.items.length >= MAX_ITEMS) return say(`予定は ${MAX_ITEMS} 件までです`);
    const it = cleanItem({ ...fields, id: newId() }, n);
    t.items.push(it);
    ui.justAdded = it.id;
    say(`${it.day + 1}日目に「${title}」を足しました`);
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
  closeItemForm();
  removeWithUndo(t, t.items, i, (it) => it.title);
});

// おくるんの「場所・予定」（/plan/）：この予定をカレンダーの予定として送る（中身は js/card.js）
function planUrl(t, it) {
  return window.OQRN ? `${window.OQRN.top}/plan/?${planQuery(t, it)}` : "#";
}

// ---- 持ち物 ----
function renderBring(t) {
  const done = t.bring.filter((b) => b.done).length;
  $("bringMeta").textContent = t.bring.length ? `${done} / ${t.bring.length}` : "";
  $("bringList").innerHTML = bringListHtml(t.bring);
  $("bIdeas").innerHTML = bringIdeasHtml(t.bring);
  $("bClear").hidden = !done;
}

// 持ち物を1つ足す（空・同じ名前は足さない。上限まで）
function addBring(text) {
  const t = currentTrip(state);
  const name = str(text, 30);
  if (!name || t.bring.some((b) => b.name === name)) return;
  // 上限をこえると、次に開いたときに消えてしまうので、ここで止める
  if (t.bring.length >= MAX_BRING) return say(`持ち物は ${MAX_BRING} こまでです`);
  t.bring.push({ id: newId(), name, done: false });
  touch(t);
  persist();
  render();
}
// 持ち物の欄の文字を足して、欄を空にする
function addBringFromInput() {
  addBring($("bName").value);
  $("bName").value = "";
}
$("bAdd").addEventListener("click", addBringFromInput);
$("bName").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) addBringFromInput();
});
$("bIdeas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-bidea]");
  if (b) addBring(b.dataset.bidea);
});
$("bringList").addEventListener("change", (e) => {
  const box = e.target.closest("[data-bring]");
  if (!box) return;
  const b = currentTrip(state).bring.find((x) => x.id === box.dataset.bring);
  if (b) b.done = box.checked;
  persist();
  render();
});
$("bringList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-bdel]");
  if (!del) return;
  const t = currentTrip(state);
  const i = t.bring.findIndex((b) => b.id === del.dataset.bdel);
  if (i < 0) return render();
  removeWithUndo(t, t.bring, i, (b) => b.name);
});
$("bClear").addEventListener("click", () => {
  const checked = currentTrip(state).bring.filter((b) => b.done);
  checked.forEach((b) => (b.done = false));
  persist();
  render();
  say(`チェックを ${checked.length} こ外しました`, () => {
    checked.forEach((b) => (b.done = true));
    persist();
    render();
  });
});

// ---- みんなに渡す ----
// 詰めるのは非同期なので、あとから始めたものだけを使う（古い中身のリンクで上書きしない）
let shareSeq = 0;
// しおりを詰めたリンクと、送るカードのリンクを作りなおす
async function renderShare(t) {
  const seq = ++shareSeq;
  const packed = await packTrip(t);
  if (seq !== shareSeq) return;
  ui.shareUrl = tripUrl(packed);
  const { params, fits } = tripCard(t, ui.shareUrl);
  $("cardBtn").href = window.OQRN ? window.OQRN.cardUrl(params) : "#";
  $("cardNote").hidden = fits;
  $("cardNote").textContent = "※ しおりが長いので、カードのボタンからはしおりを開けません。「しおりのリンクを送る」もいっしょに送ってください。";
}

$("shareBtn").addEventListener("click", async () => {
  const t = currentTrip(state);
  if (!ui.shareUrl) await renderShare(t);
  // 詰めているあいだに描きなおしが重なって、まだできていなければ、ここで詰める（空のリンクを渡さない）
  if (!ui.shareUrl) ui.shareUrl = tripUrl(await packTrip(t));
  const text = `${t.emoji} ${t.title}（${rangeLabel(t)}）のしおり`;
  if (navigator.share) {
    try {
      await navigator.share({ title: text, text, url: ui.shareUrl });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  // Q キットのコピー（できないときは長押しで選べる文字の窓）
  await window.LineShareUI?.copy(`${text}\n${ui.shareUrl}`, {
    done: () => say("しおりのリンクをコピーしました。LINE などに貼りつけて送ってください"),
    title: "長押ししてコピーしてください"
  });
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
  say("控えを書き出しました");
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) return say("ファイルが大きすぎます（ゆくさきで書き出した控えか確かめてください）");
  try {
    const added = importJson(state, await file.text());
    persist();
    render();
    say(`控えを読みこみました（しおりが ${added} つふえました）`);
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
  say(`「${trash.trip.title}」のしおりを消しました`, () => {
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
    const snap = JSON.stringify(state);
    const got = receiveTrip(state, await unpackTrip(m[1]));
    if (!got) throw new Error("bad");
    if (got.full) return say("しおりがいっぱいです。使わないしおりを消してから、もう一度リンクを開いてください");
    ui.day = todayIndex(got.trip);
    closeItemForm();
    ui.tripForm = null;
    persist();
    render();
    // 自分の端末のほうが新しければ、上書きしない（自分で直したばかりなど）
    if (got.kept) return say(`「${got.trip.title}」は、この端末のほうが新しいので、そのまま開きました`);
    say(got.before ? `「${got.trip.title}」を新しい内容にしました` : `「${got.trip.title}」のしおりを受けとりました`, () => {
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
  // 日にちを短く直したときも、えらんでいる日をしおりの中に（見出しの天気のリンクも、その日で作る）
  ui.day = Math.min(ui.day, dayCount(t.start, t.end) - 1);
  renderHead(t);
  renderDays(t);
  renderItemForm(t);
  renderBring(t);
  ui.shareUrl = "";
  renderShare(t);
}

window.addEventListener("hashchange", receiveFromHash);

// 最初だけの使い方（Q キットの「💡 使い方」。「わかった」で消え、その端末では二度と出さない）
window.addEventListener("load", () =>
  window.LineShareUI?.firstTip?.(
    "yuqsaki",
    [
      "行き先と日にちを決めると、日ごとの予定と持ち物をまとめたしおりができます",
      "予定の名前を押すと直せます。右の丸は「行った・済んだ」のしるし",
      "「しおりのリンクを送る」で、家族や友だちに同じしおりを渡せます"
    ],
    document.getElementById("tripBar")
  )
);
// 日付をまたいで開きっぱなしでも、「あと○日」「○日目」「きょう」を今日に
let shownDay = ymd();
// 日付が変わっていたら描きなおす
const refreshDay = () => {
  if (ymd() === shownDay) return;
  shownDay = ymd();
  render();
};
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refreshDay());
setInterval(refreshDay, 30000);
const first = currentTrip(state);
if (first) ui.day = todayIndex(first);
render();
receiveFromHash();
