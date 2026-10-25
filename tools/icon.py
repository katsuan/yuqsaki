#!/usr/bin/env python3
"""ゆくさき（YuQsaki）のアイコン・ロゴ・OGP を作る。

名前は「ゆくさき」（行く先）。英字は YuQsaki（「ゆ・く・さき」の「く」を Q にする。おくるん＝OQRN・つづく＝TuZuQ と同じ作り方）。
アイコンはおくるんと同じ角の丸い四角に、海の青緑のグラデーション。
Q は地図のピン：白い輪の中に行き先のピン、右下へのびるしっぽは道のりの点線と、着いた先の丸。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg … 横長のロゴ「YuQsaki」（Jua。Q はアイコンと同じ形）
  ogp.png  … 共有したときの画像（1200×630）

使い方: python3 tools/icon.py（となりのおくるん（q-oqrn）の tools/brandkit.py を使う）
"""
from pathlib import Path

import brandkit_path  # noqa: F401
from brandkit import Brand, centered, polar

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(80, 205, 200), dark=(18, 150, 176))

C = (46, 46)
R, RING_W = 24, 10
PIN = (C[0], C[1] - 3.5)
SHAPES = [
    {"t": "ring", "c": C, "r": R, "w": RING_W},
    # 行き先のピン（丸＋下へとがる三角）と、まん中の穴
    {"t": "circle", "c": PIN, "r": 7.6},
    {"t": "poly", "p": [(PIN[0] - 6.6, PIN[1] + 3.8), (PIN[0] + 6.6, PIN[1] + 3.8), (PIN[0], PIN[1] + 14)]},
    {"t": "circle", "c": PIN, "r": 3, "fill": "bg"},
    # しっぽ：道のり（とびとびの点）と、着いた先の丸
    {"t": "line", "p": [polar(C, 45, R + 1), polar(C, 45, 31)], "w": 6.5},
    {"t": "circle", "c": polar(C, 45, 38.5), "r": 2.9},
    {"t": "circle", "c": polar(C, 45, 47), "r": 4.6},
]
SHAPES, (_DX, _DY) = centered(SHAPES)
C = (C[0] + _DX, C[1] + _DY)
RING_OUTER = R + RING_W / 2


def decorate(d, s):
    """OGP の背景：うっすら波と、点線の道のり"""
    for i in range(14):
        x = 500 + i * 48
        r = 7 if i % 3 else 10
        d.ellipse(((x - r) * s, (566 - r) * s, (x + r) * s, (566 + r) * s), fill=(255, 255, 255, 55 if i % 3 else 90))
    for x, y, r, a in ((1080, 96, 54, 40), (1150, 210, 26, 35)):
        d.ellipse(((x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s), fill=(255, 255, 255, a))


# アイコン・ロゴ・OGP の画像をまとめて作る（python3 tools/icon.py で動かす）
def main():
    BRAND.write_icons(ROOT, SHAPES)
    logo, ratio = BRAND.logo_svg("YuQsaki", SHAPES, C, RING_OUTER, "YuQsaki（ゆくさき）")
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(
        ROOT / "ogp.png", SHAPES, "ゆくさき", "YuQsaki",
        ["予定・場所・持ち物を、まとめて", "リンクで家族や友だちに渡せる"], decorate,
        copy="ゆく先を、ひとつのしおりに",
    )
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp.png を書き出しました")


if __name__ == "__main__":
    main()
