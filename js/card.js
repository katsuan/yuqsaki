// ゆくさき：おくるんに渡す中身（しおりのお知らせカード・予定をカレンダーの予定として送る「場所・予定」）。画面には触らない
import { addDays, dayCount, itemsOf, label, rangeLabel, str } from "./store.js?v=202610251105";
import { PAGE_URL, mapUrl } from "./link.js?v=202610251105";

export const CARD_COLOR = "#12A0B0"; // ロゴの海の色
export const URI_LIMIT = 1000; // LINE のカードのボタンに入れられる URL の長さ

/**
 * しおりのお知らせカード（OQRN.cardUrl に渡す）。shareUrl はしおりを詰めたリンク
 * - ボタンは、リンクが長すぎなければ「しおりを開く」、長ければゆくさきのページ（fits で知らせる）
 */
export function tripCard(t, shareUrl) {
  const lines = Array.from({ length: dayCount(t.start, t.end) }, (_, i) => {
    const names = itemsOf(t, i).map((it) => `${it.time ? it.time + " " : ""}${it.title}`);
    return names.length ? `【${i + 1}日目 ${label(addDays(t.start, i))}】\n${names.slice(0, 6).join("\n")}${names.length > 6 ? `\nほか ${names.length - 6} 件` : ""}` : "";
  }).filter(Boolean);
  const fits = shareUrl.length <= URI_LIMIT;
  const params = new URLSearchParams({
    headerTitle: `${t.emoji} 旅のしおり`,
    title: t.title,
    date: rangeLabel(t),
    showDate: "true",
    detail: str(lines.join("\n\n"), 300) || "予定はこれから",
    theme: "custom",
    customColor: CARD_COLOR,
    showAction: "true",
    actionLabel: fits ? "🧳 しおりを開く" : "🧳 ゆくさきを開く",
    actionUrl: fits ? shareUrl : PAGE_URL,
    from: "yuqsaki"
  });
  return { params, fits };
}

/** おくるんの「場所・予定」（/plan/）に渡す中身（? のあと）。空白は %20 で（liff.line.me を通ると「+」が残るため） */
export function planQuery(t, it) {
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
  return String(q).replace(/\+/g, "%20");
}
