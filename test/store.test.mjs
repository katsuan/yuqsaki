// ゆくさき：しおりの読みこみ（端末の中身・控えのファイル・共有リンク）のテスト（画面に触らない部分）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
const { importJson, exportJson, receiveTrip, load, MAX_ITEMS, MAX_IMPORT_BYTES, MAX_TRIPS } = await import("../js/store.js");
const { packTrip, unpackTrip, MAX_LINK_CHARS } = await import("../js/share.js");

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
