// ゆくさき：画面の部品の HTML（js/view.js）。画面は開かない
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import * as V from "../js/view.js";

const trip = (over = {}) => ({
  id: "t1", title: "沖縄", emoji: "✈️", start: "2026-11-20", end: "2026-11-22", upd: 1,
  items: [
    { id: "a", day: 0, time: "09:30", kind: "✈️", title: "那覇空港に着く", place: "那覇空港", memo: "", done: false },
    { id: "b", day: 0, time: "", kind: "🍴", title: "<お昼>", place: "", memo: "ソーキそば", done: true },
    { id: "c", day: 2, time: "", kind: "", title: "帰る", place: "", memo: "", done: false }
  ],
  bring: [{ id: "x", name: "水着", done: false }, { id: "y", name: "日焼け止め", done: true }],
  ...over
});

test("見出しの右の数：出発の前は「あと○日」、旅行中は「○日目」、終わったら「おかえり」", () => {
  const t = trip();
  assert.deepEqual(V.countView(t, "2026-11-04"), { html: "あと<b>16</b>日", cls: "" });
  assert.deepEqual(V.countView(t, "2026-11-19"), { html: "あと<b>1</b>日", cls: "" });
  assert.deepEqual(V.countView(t, "2026-11-20"), { html: "<b>1</b>日目", cls: "is-now" });
  assert.deepEqual(V.countView(t, "2026-11-22"), { html: "<b>3</b>日目", cls: "is-now" });
  assert.deepEqual(V.countView(t, "2026-11-23"), { html: "おかえり", cls: "is-past" });
});

test("日にちのタブ：○日目・日付・きょう・その日の予定の数（ない日は数を出さない）", () => {
  const html = V.dayTabsHtml(trip(), 1, "2026-11-21");
  const tabs = html.split("</button>").filter(Boolean);
  assert.equal(tabs.length, 3);
  assert.match(tabs[0], /aria-selected="false" data-day="0">1日目<small>11\/20（金）<\/small><i>2<\/i>/);
  assert.match(tabs[1], /aria-selected="true" data-day="1">2日目<small>11\/21（土） きょう<\/small>$/);
  assert.match(tabs[2], /<i>1<\/i>/);
  assert.equal(V.dayOptionsHtml(trip()).match(/<option/g).length, 3);
  assert.match(V.dayOptionsHtml(trip()), /<option value="0">1日目 11\/20<\/option>/);
});

test("予定の並び：名前は HTML にしない・済みに印・直している予定と足したばかりの予定に印・場所がなければ名前で地図", () => {
  const t = trip();
  const map = (q) => `map:${encodeURIComponent(q)}`; // 本物の mapUrl（js/link.js）と同じく、場所は URL の形にしてわたす
  const html = V.timelineHtml(t.items.filter((it) => it.day === 0), map, { day: 0, editing: "a", justAdded: "b" });
  assert.match(html, /class="item is-editing"/);
  assert.match(html, /class="item is-done is-new"/);
  assert.match(html, /&lt;お昼&gt;/);
  assert.doesNotMatch(html, /<お昼>/);
  assert.match(html, new RegExp(`href="map:${encodeURIComponent("那覇空港")}"`));
  assert.match(html, /href="map:%3C[^"]*"[^>]*><span class="ls-icon" data-icon="place" aria-hidden="true"><\/span><span>地図で見る<\/span>/);
  assert.match(html, /aria-pressed="true" aria-label="&lt;お昼&gt; 済み"><span class="ls-icon" data-icon="check"/);
  assert.match(html, /edit-hint/);
  assert.match(V.timelineHtml([], map, { day: 1 }), /2日目の予定はまだありません/);
});

test("持ち物：チェックと消すボタン。よくある持ち物は、もう入っているものを出さない", () => {
  const t = trip();
  const list = V.bringListHtml(t.bring);
  assert.match(list, /<li class="">[\s\S]*data-bring="x" >/);
  assert.match(list, /<li class="is-done">[\s\S]*data-bring="y" checked>/);
  const ideas = V.bringIdeasHtml(t.bring);
  assert.doesNotMatch(ideas, /日焼け止め/);
  assert.equal(ideas.match(/data-bidea=/g).length, V.BRING_IDEAS.length - 1);
});

test("しるし：候補のボタン（いまのしるしに印・名前があれば小さく）と、カスタムは絵文字の1つめだけ", () => {
  const kinds = V.markItemsHtml(V.KINDS, "🍴", "kind-item");
  assert.equal(kinds.match(/role="radio"/g).length, V.KINDS.length);
  assert.match(kinds, /class="ls-picker-item kind-item" type="button" role="radio" aria-checked="true" aria-label="ごはん" data-mark="🍴">🍴<small>ごはん<\/small>/);
  const trips = V.markItemsHtml(V.TRIP_EMOJIS.map((e) => [e]), "🧳");
  assert.match(trips, /^<button class="ls-picker-item" type="button" role="radio" aria-checked="true" data-mark="🧳">🧳<\/button>/);
  assert.equal(V.firstMark(" 👨‍👩‍👧 家族"), "👨‍👩‍👧");
  assert.equal(V.firstMark("abc"), "");
  assert.equal(V.firstMark("<b>"), "");
  assert.equal(V.firstMark(""), "");
  assert.match(V.tripBarHtml([trip()], "t1"), /aria-pressed="true" data-trip="t1">✈️ 沖縄<\/button><button class="ls-chip is-small new-trip"/);
});
