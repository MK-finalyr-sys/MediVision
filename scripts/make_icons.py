"""Generate MediVision AI PWA icons (pill + cross on calm medical blue)."""
from PIL import Image, ImageDraw

BLUE = (29, 78, 216)        # #1D4ED8 calm medical blue
WHITE = (248, 250, 252)     # #F8FAFC
NAVY = (15, 23, 42)

def make_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BLUE)
    d = ImageDraw.Draw(img)
    s = size
    if maskable:
        # keep content within the inner 80% safe zone
        pad = int(s * 0.12)
    else:
        pad = int(s * 0.08)

    # capsule (rounded rectangle) diagonal
    capsule_w = int(s * 0.62)
    capsule_h = int(s * 0.30)
    cx, cy = s // 2, s // 2
    box = [cx - capsule_w // 2, cy - capsule_h // 2, cx + capsule_w // 2, cy + capsule_h // 2]
    radius = capsule_h // 2
    d.rounded_rectangle(box, radius=radius, fill=WHITE)
    # divider line
    d.line([cx, box[1], cx, box[3]], fill=BLUE, width=max(2, s // 48))

    # cross mark on top-right corner of capsule
    cross_r = int(s * 0.09)
    cross_cx = box[2] - radius // 2
    cross_cy = box[1]
    bar = int(cross_r * 0.38)
    d.rounded_rectangle(
        [cross_cx - cross_r, cross_cy - bar, cross_cx + cross_r, cross_cy + bar],
        radius=bar // 2, fill=WHITE,
    )
    d.rounded_rectangle(
        [cross_cx - bar, cross_cy - cross_r, cross_cx + bar, cross_cy + cross_r],
        radius=bar // 2, fill=WHITE,
    )
    _ = pad  # reserved for future maskable tuning
    return img

if __name__ == "__main__":
    import os
    out = "/home/z/my-project/public/icons"
    os.makedirs(out, exist_ok=True)
    make_icon(192).save(f"{out}/icon-192.png")
    make_icon(512).save(f"{out}/icon-512.png")
    make_icon(512, maskable=True).save(f"{out}/icon-512-maskable.png")
    print("icons written:", os.listdir(out))
