"""송신 스프라이트 배경 제거 스크립트.

회색 배경(채도 낮고 밝은 픽셀) 중 이미지 테두리와 연결된 영역만 배경으로 보고 지운다.
사용법: python3 tools/cutout.py assets/src/songsin_original.png assets/songsin.png
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def largest_component(mask):
    """mask에서 가장 큰 4-연결 덩어리만 남기고, 그 안의 구멍(치아 등)은 채운다."""
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    best, best_size, cur = 0, 0, 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or label[sy, sx]:
                continue
            cur += 1
            label[sy, sx] = cur
            q, size = deque([(sy, sx)]), 0
            while q:
                y, x = q.popleft()
                size += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = cur
                        q.append((ny, nx))
            if size > best_size:
                best, best_size = cur, size
    return label == best


def main(src, dst):
    rgb = np.array(Image.open(src).convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    bright = rgb.mean(axis=2)
    bg_like = (sat < 22) & (bright > 105)

    # 테두리에서 시작하는 flood fill
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg_like[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg_like[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg_like[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    fg_mask = largest_component(~bg)
    fg = Image.fromarray((fg_mask * 255).astype(np.uint8))
    # 잡티 제거(열림) 후 가장자리 1px 깎고 부드럽게
    fg = fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    fg = fg.filter(ImageFilter.MinFilter(3))
    fg = fg.filter(ImageFilter.GaussianBlur(1.2))

    # 가장 큰 덩어리만 남기기(작은 배경 조각 제거): 알파 기준 bbox crop
    a = np.array(fg)
    ys, xs = np.where(a > 128)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 6
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(h, y1 + pad + 1), min(w, x1 + pad + 1)

    out = np.dstack([rgb.astype(np.uint8), a])[y0:y1, x0:x1]
    Image.fromarray(out, "RGBA").save(dst, optimize=True)
    print("saved", dst, out.shape)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
