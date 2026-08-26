#!/usr/bin/env python3
"""Overpass APIから近畿・中国・四国地方(15府県)の
食事ができる店(amenity=restaurant)のデータを取得し、data/restaurants.jsonを生成する。"""

import json
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_RETRIES = 3
RETRY_WAIT_SECONDS = 30
BETWEEN_QUERY_WAIT_SECONDS = 10
HEADERS = {"User-Agent": "kinki-gourmet-map/1.0 (personal PWA project)"}
BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = BASE_DIR / "data" / "restaurants.json"

# 「食事ができる店」に絞るため amenity=restaurant のみを対象とする。
# cafe/fast_food/bar は対象外(ユーザー指示)。
# 府県ごとにISO3166-2コードでエリアを区切って個別クエリを実行することで、
# addr:province等のタグが無い施設でも都道府県を確実に判定できるようにする。
PREFECTURES = [
    ("滋賀県", "JP-25"),
    ("京都府", "JP-26"),
    ("大阪府", "JP-27"),
    ("兵庫県", "JP-28"),
    ("奈良県", "JP-29"),
    ("和歌山県", "JP-30"),
    ("鳥取県", "JP-31"),
    ("島根県", "JP-32"),
    ("岡山県", "JP-33"),
    ("広島県", "JP-34"),
    ("山口県", "JP-35"),
    ("徳島県", "JP-36"),
    ("香川県", "JP-37"),
    ("愛媛県", "JP-38"),
    ("高知県", "JP-39"),
]

QUERY_TEMPLATE = """
[out:json][timeout:180];
area["ISO3166-2"="{code}"]->.pref;
(
  node["amenity"="restaurant"](area.pref);
  way["amenity"="restaurant"](area.pref);
);
out center tags;
"""


def run_query(query: str, label: str) -> dict:
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"[{label}] Overpass APIへリクエスト送信中 (試行 {attempt}/{MAX_RETRIES})...")
            resp = requests.post(
                OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=200
            )
            resp.raise_for_status()
            data = resp.json()
            elements = data.get("elements", [])
            print(f"[{label}] {len(elements)}件取得")
            return data
        except (requests.RequestException, json.JSONDecodeError) as exc:
            last_error = exc
            print(f"[{label}] エラー: {exc}", file=sys.stderr)
            if attempt < MAX_RETRIES:
                print(f"[{label}] {RETRY_WAIT_SECONDS}秒待って再試行します...")
                time.sleep(RETRY_WAIT_SECONDS)
    raise RuntimeError(f"[{label}] {MAX_RETRIES}回試行しましたが失敗しました: {last_error}")


def element_latlng(element: dict) -> Optional[Tuple[float, float]]:
    if element["type"] == "node":
        return element.get("lat"), element.get("lon")
    center = element.get("center")
    if center:
        return center.get("lat"), center.get("lon")
    return None


def build_address(tags: dict) -> Optional[str]:
    parts = [
        tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:village"),
        tags.get("addr:suburb"),
        tags.get("addr:neighbourhood"),
        tags.get("addr:street"),
        tags.get("addr:housenumber"),
    ]
    parts = [p for p in parts if p]
    return "".join(parts) if parts else None


def to_spot(element: dict, pref: str) -> Optional[dict]:
    tags = element.get("tags", {})
    name = tags.get("name") or tags.get("name:ja")
    if not name:
        return None
    latlng = element_latlng(element)
    if not latlng or latlng[0] is None or latlng[1] is None:
        return None
    lat, lon = latlng
    return {
        "id": f"{element['type']}/{element['id']}",
        "name": name,
        "pref": pref,
        "lat": lat,
        "lng": lon,
        "cuisine": tags.get("cuisine"),
        "address": build_address(tags),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "opening_hours": tags.get("opening_hours"),
    }


def main() -> None:
    all_spots: list[dict] = []
    seen_ids: set[str] = set()

    for i, (pref_name, iso_code) in enumerate(PREFECTURES):
        query = QUERY_TEMPLATE.format(code=iso_code)
        data = run_query(query, pref_name)
        for element in data.get("elements", []):
            spot = to_spot(element, pref_name)
            if spot and spot["id"] not in seen_ids:
                seen_ids.add(spot["id"])
                all_spots.append(spot)
        if i < len(PREFECTURES) - 1:
            time.sleep(BETWEEN_QUERY_WAIT_SECONDS)

    all_spots.sort(key=lambda s: (s["pref"], s["name"]))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(all_spots, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"合計{len(all_spots)}件を {OUTPUT_PATH} に書き出しました")


if __name__ == "__main__":
    main()
