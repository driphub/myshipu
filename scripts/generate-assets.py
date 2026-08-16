from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)


def make_scene(filename, background, table, bowl, broth, accents):
    width, height = 1200, 800
    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 485, width, height), fill=table)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((260, 555, 940, 745), fill=(25, 28, 22, 75))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)
    draw = ImageDraw.Draw(image)
    draw.ellipse((250, 320, 950, 700), fill=bowl, outline=(238, 225, 202, 255), width=8)
    draw.ellipse((310, 365, 890, 635), fill=broth, outline=(101, 82, 57, 150), width=5)
    positions = [(420, 455, 505, 520), (545, 415, 630, 480), (655, 490, 760, 560), (510, 525, 595, 585), (700, 400, 775, 465)]
    for index, box in enumerate(positions):
        draw.rounded_rectangle(box, radius=18, fill=accents[index % len(accents)])
    draw.arc((325, 380, 870, 630), 190, 345, fill=(255, 255, 255, 105), width=9)
    draw.ellipse((905, 155, 1015, 265), fill=(255, 255, 255, 55))
    draw.ellipse((945, 195, 1050, 300), outline=(255, 255, 255, 80), width=5)
    image.convert("RGB").save(OUT / filename, quality=90, optimize=True)


make_scene("yam-soup.jpg", "#d9cbb7", "#745342", "#faf4e7", "#c79d62", ["#efe0b7", "#db7d4d", "#c6a56d", "#e9cf9e"])
make_scene("herbal-tea.jpg", "#cad7ce", "#4f6759", "#f4efe0", "#aa7044", ["#d58d48", "#b7a071", "#e0bb76", "#8b6949"])
make_scene("lotus-chicken.jpg", "#c8d2b7", "#695744", "#f6ead4", "#d0a56f", ["#e3c57f", "#c47d50", "#b9c88a", "#f0d6a3"])
make_scene("pumpkin-lily.jpg", "#e0c9aa", "#7d5a48", "#fff5df", "#d99145", ["#f0a34c", "#f6d9a3", "#d77d3f", "#f0c476"])
