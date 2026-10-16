"""Generate the synthetic educational datasets in content/datasets/.

The datasets are synthetic on purpose: they are small, reproducible and safe
for classroom use. Every dataset's metadata file declares `"synthetic": true`
so the UI can label it clearly.

Run from the repository root:

    python3 scripts/generate_datasets.py
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "datasets"


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


# (object name, transparency mean/sd, flexibility mean/sd, weight mean/sd)
RECYCLING_SUBTYPES: dict[str, list[tuple[str, tuple[float, float], tuple[float, float], tuple[float, float]]]] = {
    "plastik": [
        ("Su şişesi", (80, 8), (72, 8), (22, 5)),
        ("Deterjan şişesi", (25, 10), (52, 10), (60, 12)),
        ("Yoğurt kabı", (35, 12), (58, 10), (15, 4)),
        ("Plastik poşet", (55, 15), (88, 5), (5, 2)),
    ],
    "cam": [
        ("Reçel kavanozu", (85, 6), (4, 2), (250, 40)),
        ("Kahverengi şişe", (40, 10), (3, 2), (300, 50)),
        ("Yeşil şişe", (50, 10), (3, 2), (320, 50)),
        ("Su bardağı", (90, 4), (5, 2), (200, 30)),
    ],
    "metal": [
        ("İçecek kutusu", (1, 1), (35, 8), (15, 3)),
        ("Konserve kutusu", (1, 1), (20, 6), (60, 10)),
        ("Metal kapak", (0.5, 0.5), (25, 8), (5, 2)),
        ("Alüminyum folyo", (1, 1), (68, 10), (3, 1)),
    ],
    "kagit": [
        ("Gazete", (3, 2), (65, 8), (40, 10)),
        ("Karton kutu", (1, 1), (38, 8), (120, 30)),
        ("Defter yaprağı", (4, 2), (70, 7), (5, 2)),
        ("Yumurta kolisi", (1, 1), (30, 8), (70, 15)),
    ],
}

# Reading of a (fictional) conductivity sensor, 0-100. Painted metal lids
# read low because the paint insulates: a realistic source of model errors.
CONDUCTIVITY = {"plastik": (3, 2), "cam": (2, 1.5), "metal": (85, 8), "kagit": (4, 2)}
CONDUCTIVITY_OVERRIDES = {"Metal kapak": (22, 12)}


def generate_recycling(rng: random.Random) -> None:
    rows = []
    for label, subtypes in RECYCLING_SUBTYPES.items():
        for i in range(40):
            name, seff, esn, ag = subtypes[i % len(subtypes)]
            cond = CONDUCTIVITY_OVERRIDES.get(name, CONDUCTIVITY[label])
            rows.append(
                {
                    "nesne": name,
                    "agirlik_g": round(max(1.0, rng.gauss(*ag)), 1),
                    "seffaflik": round(clamp(rng.gauss(*seff)), 1),
                    "esneklik": round(clamp(rng.gauss(*esn)), 1),
                    "iletkenlik": round(clamp(rng.gauss(*cond)), 1),
                    "malzeme": label,
                }
            )
    rng.shuffle(rows)
    path = OUT / "geri-donusum.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["id", "nesne", "agirlik_g", "seffaflik", "esneklik", "iletkenlik", "malzeme"]
        )
        writer.writeheader()
        for i, row in enumerate(rows):
            writer.writerow({"id": i, **row})
    print(f"wrote {path.relative_to(ROOT)} ({len(rows)} rows)")


def generate_ayran(rng: random.Random) -> None:
    rows = []
    for i in range(30):
        temp = round(rng.uniform(10, 38), 1)
        sold = round(max(0, 4 * temp + 20 + rng.gauss(0, 12)))
        rows.append({"id": i, "sicaklik": temp, "ayran": sold})
    rows.sort(key=lambda r: r["sicaklik"])
    for i, row in enumerate(rows):
        row["id"] = i
    path = OUT / "ayran-satislari.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "sicaklik", "ayran"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {path.relative_to(ROOT)} ({len(rows)} rows)")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    generate_recycling(random.Random(2024))
    generate_ayran(random.Random(7))
