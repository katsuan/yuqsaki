// ゆくさき：しおりの読みこみ（端末の中身・控えのファイル・共有リンク）のテスト（画面に触らない部分）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
const S = await import("../js/store.js");
const { importJson, exportJson, receiveTrip, load, MAX_ITEMS, MAX_IMPORT_BYTES, MAX_TRIPS } = S;
const { packTrip, unpackTrip, MAX_LINK_CHARS } = await import("../js/link.js");

const XSS = '" onclick=alert(1) x'; // qcheck-ok: W8 テストの見本の文字
const ID = /^[a-z0-9]{4,20}$/;
const trip = (extra = {}) => ({ id: "trip0001", title: "沖縄", emoji: "🌺", start: "2026-11-01", end: "2026-11-03", upd: 1, items: [{ id: "item0001", day: 1, time: "10:00", kind: "🍴", title: "そば", place: "那覇" }], bring: [{ id: "bring001", name: "水着" }], ...extra });
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("共有リンクで受けとった id に記号が入っていても、ボタンに入るのは英数字だけ", async () => {
  const evil = trip({ id: XSS, items: [{ id: XSS, title: "a" }], bring: [{ id: XSS, name: "b" }] });
  const state = { v: 1, trips: [], current: null };
  const got = receiveTrip(state, await unpackTrip("j" + b64url(JSON.stringify(evil))));
  assert.match(got.trip.id, ID);
  assert.match(got.trip.items[0].id, ID);
  assert.match(got.trip.bring[0].id, ID);
});

test("同じ id が重なっても別々になる", () => {
  const state = { v: 1, trips: [], current: null };
  importJson(state, JSON.stringify({ trips: [trip({ items: [{ id: "same0001", title: "a" }, { id: "same0001", title: "b" }] }), trip()] }));
  assert.equal(new Set(state.trips.map((t) => t.id)).size, state.trips.length);
  assert.equal(new Set(state.trips[0].items.map((i) => i.id)).size, 2);
});

test("しおりを詰めたリンクは、開くと同じ中身に戻る（済みのしるしは外れる）", async () => {
  const t = trip();
  t.items[0].done = true;
  const back = await unpackTrip(await packTrip(t));
  assert.equal(back.title, "沖縄");
  assert.equal(back.items[0].title, "そば");
  assert.equal("done" in back.items[0], false);
});

test("壊れたリンク・長すぎるリンク・大きくふくらむリンクは断る", async () => {
  await assert.rejects(unpackTrip("x" + "abc"));
  await assert.rejects(unpackTrip("j" + "!!!"));
  await assert.rejects(unpackTrip("z" + "a".repeat(MAX_LINK_CHARS)));
  const bomb = "z" + b64url(deflateRawSync(Buffer.from(JSON.stringify({ t: " ".repeat(5 * 1024 * 1024) }))));
  assert.ok(bomb.length < MAX_LINK_CHARS, "細工したリンクは短い");
  await assert.rejects(unpackTrip(bomb));
});

test("壊れた中身・形のちがう日付や時刻は捨て、長い文字は切る。数にも上限", () => {
  mem.set("yuqsaki:v1", JSON.stringify({ trips: [null, { start: "x" }, trip({ title: "あ".repeat(99), items: [{ title: "a", time: "25:00", day: 99 }] })] }));
  const s = load();
  assert.equal(s.trips.length, 1);
  assert.equal(s.trips[0].title.length, 30);
  assert.equal(s.trips[0].items[0].time, "");
  assert.equal(s.trips[0].items[0].day, 2);
  const big = { trips: Array.from({ length: 80 }, (_, i) => trip({ id: `t${1000 + i}`, items: Array.from({ length: 200 }, (_, j) => ({ title: `x${j}` })) })) };
  const state = { v: 1, trips: [], current: null };
  importJson(state, JSON.stringify(big));
  assert.equal(state.trips.length, MAX_TRIPS);
  assert.equal(state.trips[0].items.length, MAX_ITEMS);
  assert.throws(() => importJson(state, " ".repeat(MAX_IMPORT_BYTES + 1)));
});

test("書き出した控えを読みこむと、同じしおりに戻る", () => {
  const a = { v: 1, trips: [], current: null };
  importJson(a, JSON.stringify({ trips: [trip()] }));
  const b = { v: 1, trips: [], current: null };
  importJson(b, exportJson(a));
  assert.deepEqual(b.trips, a.trips);
});

test("ない日付（2月30日など）のしおりは捨てる。うるう日はそのまま", async () => {
  const { cleanTrip, dayCount, stayLabel } = await import("../js/store.js");
  assert.equal(cleanTrip(trip({ start: "2026-02-30", end: "2026-03-02" })), null);
  assert.equal(cleanTrip(trip({ start: "2026-13-01" })), null);
  assert.equal(cleanTrip(trip({ start: "2026-02-27", end: "2026-02-30" })).end, "2026-02-27");
  const leap = cleanTrip(trip({ start: "2028-02-28", end: "2028-03-01" }));
  assert.equal(dayCount(leap.start, leap.end), 3);
  assert.equal(stayLabel(leap), "2泊3日");
  assert.equal(dayCount("2026-12-31", "2027-01-01"), 2); // 年をまたぐ
});

test("リンクで受けとったとき：自分の済みのしるしは残し、自分のほうが新しければ上書きしない", () => {
  const state = { v: 1, trips: [], current: null };
  receiveTrip(state, trip({ upd: 10 }));
  state.trips[0].items[0].done = true;
  state.trips[0].bring[0].done = true;
  // 新しい内容が届いた
  const got = receiveTrip(state, trip({ upd: 20, title: "沖縄2" }));
  assert.equal(got.trip.title, "沖縄2");
  assert.ok(got.before);
  assert.equal(got.trip.items[0].done, true);
  assert.equal(got.trip.bring[0].done, true);
  // 古い内容が届いても、この端末のほうを残す
  const old = receiveTrip(state, trip({ upd: 5, title: "古い" }));
  assert.equal(old.kept, true);
  assert.equal(state.trips[0].title, "沖縄2");
  assert.equal(state.trips.length, 1);
});

test("しおりがいっぱいのときは、リンクで受けとっても上限をこえない", () => {
  const state = { v: 1, trips: [], current: null };
  importJson(state, JSON.stringify({ trips: Array.from({ length: MAX_TRIPS }, (_, i) => trip({ id: `t${1000 + i}` })) }));
  const got = receiveTrip(state, trip({ id: "newtrip1" }));
  assert.equal(got.full, true);
  assert.equal(state.trips.length, MAX_TRIPS);
  // すでにあるしおりの上書きはできる
  assert.ok(receiveTrip(state, trip({ id: "t1000", upd: 99, title: "上書き" })).before);
});

test("長い文字を切っても、絵文字が半分にならない", async () => {
  const { cleanTrip } = await import("../js/store.js");
  const t = cleanTrip(trip({ title: "あ".repeat(29) + "🌺", emoji: "abcdefg🌺" }));
  assert.equal(t.title, "あ".repeat(29));
  assert.equal(t.emoji, "abcdefg");
});

test("日にちの書き方（日帰り・泊まり・年をまたぐ）", async () => {
  const { rangeLabel } = await import("../js/store.js");
  assert.equal(rangeLabel({ start: "2026-11-01", end: "2026-11-01" }), "11/1（日）");
  assert.equal(rangeLabel({ start: "2026-12-31", end: "2027-01-02" }), "12/31（木） 〜 1/2（土）");
});

test("そらくるで開く：その日の予定の場所 → しおりのどこかの場所 → しおりの名前のはじめのことば。時刻は最初の予定", () => {
  const trip = {
    title: "沖縄 家族旅行",
    start: "2026-11-01",
    end: "2026-11-03",
    items: [
      { id: "a", day: 0, time: "", kind: "📍", title: "空港", place: "", memo: "", done: false },
      { id: "b", day: 0, time: "13:30", kind: "📍", title: "水族館", place: "沖縄美ら海水族館", memo: "", done: false },
      { id: "c", day: 0, time: "09:15", kind: "✈️", title: "出発", place: "", memo: "", done: false },
      { id: "d", day: 2, time: "", kind: "🛍️", title: "おみやげ", place: "国際通り", memo: "", done: false }
    ]
  };
  assert.deepEqual(S.weatherSpot(trip, 0), { place: "沖縄美ら海水族館", alt: "沖縄", date: "2026-11-01", hour: 9 });
  assert.deepEqual(S.weatherSpot(trip, 1), { place: "沖縄美ら海水族館", alt: "沖縄", date: "2026-11-02", hour: null });
  assert.deepEqual(S.weatherSpot(trip, 2), { place: "国際通り", alt: "沖縄", date: "2026-11-03", hour: null });
  assert.deepEqual(S.weatherSpot({ ...trip, items: [] }, 0), { place: "沖縄", alt: "", date: "2026-11-01", hour: null });
  assert.equal(S.weatherSpot({ ...trip, title: "  ", items: [] }, 0), null);
});
