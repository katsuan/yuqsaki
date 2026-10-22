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

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
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
  const kind = text[0];
  const body = dec(text.slice(1));
  const bytes = kind === "z" ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  return JSON.parse(new TextDecoder().decode(bytes));
}
