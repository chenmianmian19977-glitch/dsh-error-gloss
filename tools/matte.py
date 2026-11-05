"""tools/matte.py — 洋红底抠图 + 裁切 + 压缩，产出插件要用的资产。

用法：
    python tools/matte.py

输入（默认从下载目录读，可用 --src 改）：
    平静.png  抱歉 .png  认真.png  思考.png  图标.png  GITHUB首图.png

输出：
    client/assets/mascot-calm.webp      128×128 透明（正中头像）
    client/assets/mascot-serious.webp
    client/assets/mascot-thinking.webp
    client/assets/mascot-sorry.webp
    client/assets/icon.png              256×256 不透明（紧裁：告示牌 + 脸）
    assets/hero.png                     1280×640（README 头图）

为什么要抠：ChatGPT 出不了透明背景，但它能出纯色底；纯 #FF00FF 是最不容易
和角色配色撞车的键色（这角色是蓝白系）。抠完再缩到 128，体积可控。
"""
import argparse
import math
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 文件名 → 输出名。注意「抱歉 .png」原文里 # 号前有一个空格，照抄。
EXPRESSIONS = [
    ("平静.png", "mascot-calm"),
    ("抱歉 .png", "mascot-sorry"),
    ("认真.png", "mascot-serious"),
    ("思考.png", "mascot-thinking"),
]

KEY = (255, 0, 255)
T0, T1 = 70.0, 150.0    # 与键色的距离在此区间内做软过渡（去锯齿）


def matte(img: Image.Image) -> Image.Image:
    """把洋红底换成透明，并对边缘做去溢色。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            d = math.dist((r, g, b), KEY)
            if d >= T1:
                continue
            if d <= T0:
                px[x, y] = (r, g, b, 0)
                continue
            # 边缘：按距离给半透明，并把偏洋红的分量压回去（去紫边）
            alpha = int(a * (d - T0) / (T1 - T0))
            if r > g and b > g:
                lift = int((min(r, b) - g) * 0.55)
                g = min(255, g + lift)
            px[x, y] = (r, g, b, alpha)
    return img


def face_square(img: Image.Image) -> Image.Image:
    """从透明图里取出「以脸为中心」的正方形。"""
    bbox = img.split()[3].getbbox()
    if bbox is None:
        return img
    left, top, right, bottom = bbox
    w, h = right - left, bottom - top
    side = int(min(w, h * 0.86))          # 略偏头肩，别把整条裙摆拉进来
    cx = (left + right) // 2
    x0 = max(left, cx - side // 2)
    y0 = top + int(h * 0.01)
    x0 = min(x0, right - side)
    y0 = max(0, min(y0, img.height - side))
    return img.crop((x0, y0, x0 + side, y0 + side))


def save_webp(img: Image.Image, path: str, size: int, quality: int = 88) -> int:
    out = img.resize((size, size), Image.LANCZOS)
    out.save(path, "WEBP", quality=quality, method=6)
    return os.path.getsize(path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(os.path.expanduser("~"), "Downloads"))
    args = ap.parse_args()

    out_dir = os.path.join(ROOT, "client", "assets")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)

    total = 0
    for name, out_name in EXPRESSIONS:
        src = os.path.join(args.src, name)
        if not os.path.exists(src):
            print(f"缺失：{src}")
            return 1
        img = face_square(matte(Image.open(src)))
        dst = os.path.join(out_dir, f"{out_name}.webp")
        size = save_webp(img, dst, 128)
        total += size
        print(f"{name} → {out_name}.webp  {size/1024:.1f} KB")

    # 插件图标：整张是插画，取「告示牌 + 脸」的上半部，48px 下才认得出
    icon_src = os.path.join(args.src, "图标.png")
    if os.path.exists(icon_src):
        im = Image.open(icon_src).convert("RGB")
        w, h = im.size
        side = int(min(w, h) * 0.78)
        x0 = (w - side) // 2
        y0 = int(h * 0.02)
        im.crop((x0, y0, x0 + side, y0 + side)).resize((256, 256), Image.LANCZOS) \
            .save(os.path.join(os.path.dirname(out_dir), "icon.png"), "PNG", optimize=True)
        print("图标.png → client/icon.png 256×256")

    hero_src = os.path.join(args.src, "GITHUB首图.png")
    if os.path.exists(hero_src):
        im = Image.open(hero_src).convert("RGB")
        tw, th = 1280, 640
        scale = max(tw / im.width, th / im.height)
        nw, nh = int(im.width * scale + 0.5), int(im.height * scale + 0.5)
        im = im.resize((nw, nh), Image.LANCZOS)
        x0, y0 = (nw - tw) // 2, (nh - th) // 2
        im.crop((x0, y0, x0 + tw, y0 + th)).save(
            os.path.join(ROOT, "assets", "hero.png"), "PNG", optimize=True)
        print("GITHUB首图.png → assets/hero.png 1280×640")

    print(f"\n四个表情合计 {total/1024:.1f} KB（内联进 bundle 后约 ×1.34 = {total*1.34/1024:.1f} KB）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
