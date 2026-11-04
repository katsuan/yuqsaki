// ゆくさき：画面に出す部品の HTML と、しるしの候補。画面には触らない（文字を返すだけ。テストで呼ぶ）
// 読まれるところ：app.js（テストは test/view.test.mjs）
import { addDays, dayCount, label } from "./store.js?v=202611012034";

/** しおりのしるしの候補 */
export const TRIP_EMOJIS = ["🧳", "✈️", "🏝️", "⛰️", "♨️", "🏕️", "🎡", "🚗", "🚃", "🍜", "👪", "🎒"];
/** 予定のしるしの候補：[しるし, 名前] */
export const KINDS = [
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
/** よくある持ち物（押すと足す） */
export const BRING_IDEAS = ["着がえ", "充電器", "保険証", "常備薬", "歯ブラシ", "タオル", "日焼け止め", "雨具", "エコバッグ", "おやつ", "現金", "ウェットティッシュ"];

/** 文字を HTML に入れられる形にする（& < > " ' を置きかえる） */
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Q キットの線アイコン（HTML の文字で。名前は Q キットの kit.html の「線アイコン」） */
export const iconHtml = (name) => `<span class="ls-icon" data-icon="${name}" aria-hidden="true"></span>`;

/** カスタムのしるし：入れた文字の1つめ（絵文字が半分にならないように）。英数字・記号なら ""（使わない） */
export function firstMark(v) {
  const t = String(v ?? "").trim();
  const first = globalThis.Intl?.Segmenter ? [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(t)][0]?.segment || "" : Array.from(t)[0] || "";
  return first && !/[\x00-\x7f]/.test(first) ? first : "";
}

/** しおりの切りかえのチップ（いまのしおりに印、最後に「新しいしおり」） */
export function tripBarHtml(trips, current) {
  return (
    trips.map((t) => `<button class="ls-chip is-small" type="button" aria-pressed="${t.id === current}" data-trip="${t.id}">${esc(t.emoji)} ${esc(t.title)}</button>`).join("") +
    `<button class="ls-chip is-small new-trip" type="button" data-new>${iconHtml("add")}新しいしおり</button>`
  );
}

/** 見出しの右の数：{ html, cls }。出発の前は「あと○日」、旅行中は「○日目」、終わったら「おかえり」（today は "YYYY-MM-DD"） */
export function countView(t, today) {
  if (today < t.start) return { html: `あと<b>${dayCount(today, t.start) - 1}</b>日`, cls: "" };
  if (today <= t.end) return { html: `<b>${dayCount(t.start, today)}</b>日目`, cls: "is-now" };
  return { html: "おかえり", cls: "is-past" };
}

/** 日にちのタブ（○日目・日付・きょう・その日の予定の数） */
export function dayTabsHtml(t, day, today) {
  return Array.from({ length: dayCount(t.start, t.end) }, (_, i) => {
    const date = addDays(t.start, i);
    const count = t.items.filter((it) => it.day === i).length;
    return `<button class="ls-tab" type="button" role="tab" aria-selected="${i === day}" data-day="${i}">${i + 1}日目<small>${label(date)}${date === today ? " きょう" : ""}</small>${count ? `<i>${count}</i>` : ""}</button>`;
  }).join("");
}

/**
 * その日の予定の並び（時刻・しるしと名前・地図のリンク・メモ・済みの丸）。なければ「○日目の予定はまだありません」
 * mapUrl は場所 → 地図の URL、mark は { day, editing（直している予定の id）, justAdded（足したばかりの予定の id） }
 */
export function timelineHtml(list, mapUrl, mark) {
  if (!list.length) return `<li class="ls-empty"><span class="ls-empty-icon ls-icon" data-icon="place" aria-hidden="true"></span>${mark.day + 1}日目の予定はまだありません</li>`;
  return (
    list
      .map((it) => {
        const place = it.place || it.title;
        return `<li class="item${it.done ? " is-done" : ""}${it.id === mark.editing ? " is-editing" : ""}${it.id === mark.justAdded ? " is-new" : ""}">
            <span class="time">${it.time || ""}</span>
            <div class="body">
              <button class="title" type="button" data-edit="${it.id}" aria-label="${esc(it.title)} を直す">${it.kind ? `${esc(it.kind)} ` : ""}${esc(it.title)}</button>
              <a class="place" href="${mapUrl(place)}" target="_blank" rel="noopener">${iconHtml("place")}<span>${esc(it.place || "地図で見る")}</span></a>
              ${it.memo ? `<p class="memo">${esc(it.memo)}</p>` : ""}
            </div>
            <button class="done" type="button" data-done="${it.id}" aria-pressed="${it.done}" aria-label="${esc(it.title)} ${it.done ? "済み" : "まだ"}">${it.done ? iconHtml("check") : ""}</button>
          </li>`;
      })
      .join("") + '<li class="edit-hint">名前を押すと直せます。右の丸は「行った・済んだ」のしるし</li>'
  );
}

/** 予定の日にちの選択肢（1日目 3/1 …） */
export function dayOptionsHtml(t) {
  return Array.from({ length: dayCount(t.start, t.end) }, (_, i) => `<option value="${i}">${i + 1}日目 ${label(addDays(t.start, i)).replace(/（.）/, "")}</option>`).join("");
}

/** 持ち物の並び（チェックと消すボタン） */
export function bringListHtml(bring) {
  return bring
    .map(
      (b) => `<li class="${b.done ? "is-done" : ""}">
        <label><input type="checkbox" data-bring="${b.id}" ${b.done ? "checked" : ""}><span>${esc(b.name)}</span></label>
        <button class="mini" type="button" data-bdel="${b.id}" aria-label="${esc(b.name)} を消す">${iconHtml("close")}</button>
      </li>`
    )
    .join("");
}

/** よくある持ち物のチップ（もう入っているものは出さない） */
export function bringIdeasHtml(bring) {
  const have = new Set(bring.map((b) => b.name));
  return BRING_IDEAS.filter((n) => !have.has(n))
    .map((n) => `<button class="ls-chip is-small" type="button" data-bidea="${esc(n)}">${iconHtml("add")}${esc(n)}</button>`)
    .join("");
}

/** しるしの候補（ls-picker の中のボタン）。choices は [しるし, 名前（なくてもよい）]、now はいまのしるし */
export function markItemsHtml(choices, now, className = "") {
  return choices
    .map(([e, name]) => `<button class="ls-picker-item${className ? ` ${className}` : ""}" type="button" role="radio" aria-checked="${e === now}"${name ? ` aria-label="${name}"` : ""} data-mark="${e}">${e}${name ? `<small>${name}</small>` : ""}</button>`)
    .join("");
}
