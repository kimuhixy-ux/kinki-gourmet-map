#!/usr/bin/env python3
"""icons/icon-192.png, icon-512.png, apple-touch-icon.png を生成する。

フォーク&ナイフの絵文字(🍴)を背景色の円の上に描画する。
Apple Color Emojiフォントは固定サイズ(20/32/40/48/64/96/160)しか
読み込めないため、160で描画してから各サイズへリサイズする。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ICON_DIR = Path(__file__).resolve().parent.parent / "icons"
EMOJI_FONT_SIZE = 160
MASTER_SIZE = 512
BG_COLOR = (178, 58, 47, 255)  # #b23a2f (テーマカラー)
EMOJI_FONT_PATH = "/System/Library/Fonts/Apple Color Emoji.ttc"


def draw_master():
    img = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), BG_COLOR)
    draw = ImageDraw.Draw(img)

    font = ImageFont.truetype(EMOJI_FONT_PATH, EMOJI_FONT_SIZE)
    emoji_img = Image.new("RGBA", (EMOJI_FONT_SIZE * 2, EMOJI_FONT_SIZE * 2), (0, 0, 0, 0))
    emoji_draw = ImageDraw.Draw(emoji_img)
    emoji_draw.text((EMOJI_FONT_SIZE // 2, EMOJI_FONT_SIZE // 2), "🍴", font=font, embedded_color=True)

    bbox = emoji_img.getbbox()
    emoji_cropped = emoji_img.crop(bbox)
    scale = (MASTER_SIZE * 0.6) / max(emoji_cropped.size)
    new_size = (int(emoji_cropped.width * scale), int(emoji_cropped.height * scale))
    emoji_resized = emoji_cropped.resize(new_size, Image.LANCZOS)

    paste_x = (MASTER_SIZE - new_size[0]) // 2
    paste_y = (MASTER_SIZE - new_size[1]) // 2
    img.alpha_composite(emoji_resized, (paste_x, paste_y))

    return img


def generate(size, out_path, master):
    resized = master.resize((size, size), Image.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out_path)
    print(f"生成: {out_path}")


def main():
    master = draw_master()
    generate(192, ICON_DIR / "icon-192.png", master)
    generate(512, ICON_DIR / "icon-512.png", master)
    generate(180, ICON_DIR / "apple-touch-icon.png", master)


if __name__ == "__main__":
    main()
