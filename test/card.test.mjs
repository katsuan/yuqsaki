// ゆくさき：送るカード（js/card.js）と、ほかのページへのリンク（js/link.js）のテスト
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { tripCard, planQuery, CARD_COLOR, URI_LIMIT } = await import("../js/card.js");
const { PAGE_URL, tripUrl, mapUrl, qronosUrl, soraqruUrl } = await import("../js/link.js");

const trip = { id: "trip0001", title: "沖縄 旅行", emoji: "🌺", start: "2026-11-01", end: "2026-11-02", items: [{ id: "i1", day: 0, time: "10:00", kind: "📍", title: "美ら海", place: "本部町", memo: "P7" }, { id: "i2", day: 1, time: "", kind: "🍴", title: "そば", place: "", memo: "" }], bring: [] };

test("しおりのカード：日ごとの予定と、しおりを開くボタン。リンクが長すぎたらゆくさきのページ", () => {
  const short = tripCard(trip, tripUrl("zabc"));
  assert.equal(short.fits, true);
  assert.equal(short.params.get("actionUrl"), `${PAGE_URL}#s=zabc`);
  assert.equal(short.params.get("detail"), "【1日目 11/1（日）】\n10:00 美ら海\n\n【2日目 11/2（月）】\nそば");
  assert.equal(short.params.get("customColor"), CARD_COLOR);
  assert.equal(short.params.get("from"), "yuqsaki");
  const long = tripCard(trip, tripUrl("z" + "a".repeat(URI_LIMIT)));
  assert.equal(long.fits, false);
  assert.equal(long.params.get("actionUrl"), PAGE_URL);
});

test("予定を「場所・予定」に渡す中身：空白は %20、時刻があれば60分、場所と地図のリンク", () => {
  const q = planQuery(trip, trip.items[0]);
  assert.doesNotMatch(q, /\+/);
  const p = new URLSearchParams(q);
  assert.equal(p.get("start"), "2026-11-01T10:00");
  assert.equal(p.get("minutes"), "60");
  assert.equal(p.get("location"), "本部町");
  assert.equal(p.get("header"), "🌺 沖縄 旅行");
  assert.equal(p.get("mapUrl"), mapUrl("本部町"));
  const allDay = new URLSearchParams(planQuery(trip, trip.items[1]));
  assert.equal(allDay.get("start"), "2026-11-02");
  assert.equal(allDay.has("minutes"), false);
});

test("くろのす・そらくるへのリンクは自分のツールだけ。空白は %20", () => {
  assert.match(qronosUrl(trip), /^https:\/\/katsuan\.github\.io\/countdown\/\?type=until&date=2026-11-01/);
  const w = soraqruUrl({ place: "那覇 空港", date: "2026-11-01", hour: 10, alt: "" });
  assert.match(w, /^https:\/\/katsuan\.github\.io\/soraqru\/\?/);
  assert.doesNotMatch(w, /\+/);
  assert.equal(new URL(w).searchParams.get("hour"), "10");
  assert.equal(new URL(soraqruUrl({ place: "x", date: "2026-11-01", hour: null })).searchParams.has("hour"), false);
});
