// ゆくさき：しおりをリンクに詰める・リンクから取り出す（サーバーを使わずに、家族や友だちへ渡すため）
// しおりの JSON を deflate で縮めて base64url にし、URL の # のあとに入れる（# のあとはサーバーに送られない）
//   https://katsuan.github.io/yuqsaki/#s=<縮めたしおり>

const enc = (bytes) => {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const dec = (text) => {
  const b = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

// リンクの長さと、広げたあとの大きさの上限（小さなリンクが大きくふくらむ細工で、端末が止まらないように）
export const MAX_LINK_CHARS = 60000;
export const MAX_UNPACKED_BYTES = 512 * 1024;

async function pipe(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      reader.cancel().catch(() => {});
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  chunks.forEach((c) => {
    out.set(c, at);
    at += c.length;
  });
  return out;
}

// 送るときは、済みのしるし（done）は外す（受けとった人は、まっさらで使う）
export function shareable(trip) {
  return {
    id: trip.id,
    title: trip.title,
    emoji: trip.emoji,
    start: trip.start,
    end: trip.end,
    upd: trip.upd,
    items: trip.items.map(({ done, ...it }) => it),
    bring: trip.bring.map(({ done, ...b }) => b)
  };
}

export async function packTrip(trip) {
  const json = new TextEncoder().encode(JSON.stringify(shareable(trip)));
  if (typeof CompressionStream === "function") {
    return "z" + enc(await pipe(json, new CompressionStream("deflate-raw")));
  }
  return "j" + enc(json); // 縮められない古いブラウザ
}

export async function unpackTrip(text) {
  if (typeof text !== "string" || text.length > MAX_LINK_CHARS) throw new Error("too long");
  const kind = text[0];
  if (kind !== "z" && kind !== "j") throw new Error("bad kind");
  const body = dec(text.slice(1));
  const bytes = kind === "z" ? await pipe(body, new DecompressionStream("deflate-raw"), MAX_UNPACKED_BYTES) : body;
  if (bytes.length > MAX_UNPACKED_BYTES) throw new Error("too large");
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---- ほかのページへのリンク（行き先は自分のツールと Google マップだけ。W5） ----
export const PAGE_URL = "https://katsuan.github.io/yuqsaki/";
const QRONOS_URL = "https://katsuan.github.io/countdown/";
const SORAQRU_URL = "https://katsuan.github.io/soraqru/";
// 空白は %20 で（liff.line.me を通ると「+」がそのまま残るため。OQRN.cardUrl と同じ）
const query = (q) => String(q).replace(/\+/g, "%20");

// しおりを詰めたリンク（packTrip の結果を # のあとに）
export const tripUrl = (packed) => `${PAGE_URL}#s=${packed}`;

// Google マップで探す
export const mapUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// くろのす（カウントダウン）：出発の日までを数えるページ
export function qronosUrl(t) {
  const q = new URLSearchParams({ type: "until", date: t.start, title: `${t.title}まで`, emoji: t.emoji, from: "yuqsaki" });
  return `${QRONOS_URL}?${q}`;
}

// そらくる：その日の行き先の天気（spot は store.js の weatherSpot の答え）
export function soraqruUrl(spot) {
  const w = new URLSearchParams({ q: spot.place, name: spot.place, date: spot.date, from: "yuqsaki" });
  if (spot.hour !== null) w.set("hour", String(spot.hour));
  if (spot.alt) w.set("alt", spot.alt);
  return `${SORAQRU_URL}?${query(w)}`;
}
