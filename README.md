# 近畿グルメマップ

近畿地方(滋賀・京都・大阪・兵庫・奈良・和歌山)の食事ができるお店を1枚の地図で探せるPWA。

## データソース

OpenStreetMap(Overpass API)の `amenity=restaurant` タグを持つ施設を、
`scripts/fetch_data.py` で府県ごとに取得し `data/restaurants.json` に静的保存している。
実行時にAPIを呼ばない設計(GitHub Pagesの静的ホスティングのみで完結)。

データを更新する場合:

```bash
python3 scripts/fetch_data.py
```

## ローカル確認

```bash
python3 -m http.server 8000
open http://localhost:8000
```

Service WorkerはHTTPS/localhost以外では動作しないため、上記のように簡易サーバー経由で確認すること。
