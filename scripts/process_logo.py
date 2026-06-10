"""Generate app icon and theme brand images from the designed GitPulse logos.

Reads the original white/dark background PNGs in design/, removes the flat
background (with soft edges preserved via un-matting), crops to content, and
writes:
  - app-icon.png        (repo root, 1024x1024 transparent, source for `tauri icon`)
  - public/favicon.png  (256x256 transparent)
  - public/brand-light.png / public/brand-dark.png (cropped wordmarks for the UI)
"""

import numpy as np
from PIL import Image

LO, HI = 12, 110  # background-distance ramp for alpha


def remove_bg(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.float64)
    bg = rgb[2:8, 2:8].reshape(-1, 3).mean(axis=0)  # sample corner as bg color
    dist = np.abs(rgb - bg).max(axis=2)
    alpha = np.clip((dist - LO) / (HI - LO), 0.0, 1.0)
    # un-matte: recover original color where partially blended with bg
    a = np.maximum(alpha, 1e-6)[..., None]
    fg = np.clip(bg + (rgb - bg) / a, 0, 255)
    out = np.dstack([fg, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def crop_content(img: Image.Image, pad_ratio: float = 0.04) -> Image.Image:
    bbox = img.getchannel("A").getbbox()
    pad = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * pad_ratio)
    box = (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(img.width, bbox[2] + pad),
        min(img.height, bbox[3] + pad),
    )
    return img.crop(box)


def pad_square(img: Image.Image) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


mark = crop_content(remove_bg(Image.open("design/GitPulse.png")))
square = pad_square(mark)
square.resize((1024, 1024), Image.LANCZOS).save("app-icon.png")
square.resize((256, 256), Image.LANCZOS).save("public/favicon.png")

for src, dst in [("GitPulse_light", "brand-light"), ("GitPulse_dark", "brand-dark")]:
    crop_content(remove_bg(Image.open(f"design/{src}.png"))).save(f"public/{dst}.png")

print("done")
