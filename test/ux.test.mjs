// yuqsaki：使い心地の決まり（q-oqrn/docs/ux.md）を、ファイルの中身で確かめるテスト（画面は開かない）
//   node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("最初だけの使い方（firstTip）は3つまで。中の言葉（くらぶボット・GitHub・GAS・LIFF）を使わない（B3・G5）", () => {
  const m = read("app.js").match(/firstTip\?\.\(\s*"yuqsaki",\s*\[([\s\S]*?)\]/);
  assert.ok(m, "firstTip がある");
  const steps = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(steps.length >= 1 && steps.length <= 3, String(steps.length));
  steps.forEach((s) => assert.doesNotMatch(s, /くらぶボット|GitHub|GAS|LIFF|LINE/, s));
});

test("小さな丸のボタンも、押せる広さは 44px 以上（34px ＋ まわり 5px。C3）", () => {
  const css = read("style.css");
  assert.match(css, /\.done[^{]*\{[^}]*width: 34px/);
  assert.match(css, /\.done::after[^{]*\{[^}]*inset: -5px/);
});

test("しおりの上の3つのボタン：アイコンと名前は1行のまま（320px で「くろの／す」と折れない）", () => {
  const css = read("style.css");
  assert.match(css, /\.head-actions \.act-main \{[^}]*white-space: nowrap/);
  // 3つとも、アイコンと名前を1つのかたまりに入れている
  assert.equal((read("index.html").match(/<span class="act-main"><span class="ls-icon"/g) || []).length, 3);
});
