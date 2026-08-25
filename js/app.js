(function () {
  "use strict";

  const DEFAULT_CENTER = [34.75, 135.6];
  const DEFAULT_ZOOM = 9;
  const GEOLOCATION_ZOOM = 13;
  const MARKER_COLOR = "#b23a2f";

  const PREFS = ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"];

  // OSMのcuisineタグ(英語/日本語表記が混在)を日本語カテゴリへ振り分ける。
  // 上から順に判定し、最初に一致したカテゴリを採用する(寿司などの具体的な種別を
  // 「和食」より先に判定することで、japanese;sushiのような複合タグでも寿司に分類する)。
  const CATEGORIES = [
    { id: "sushi", label: "寿司", tokens: ["sushi"] },
    { id: "yakiniku", label: "焼肉・韓国", tokens: ["yakiniku", "korean", "barbecue", "焼肉"] },
    { id: "ramen", label: "ラーメン・麺類", tokens: ["ramen", "noodle", "noodles", "焼きそば", "ラーメン"] },
    { id: "chinese", label: "中華", tokens: ["chinese", "taiwanese", "gyoza", "餃子"] },
    {
      id: "curry_ethnic",
      label: "カレー・エスニック",
      tokens: [
        "curry", "indian", "thai", "vietnamese", "nepalese", "nepali", "asian",
        "mexican", "turkish", "kebab", "カレー", "curry rice",
      ],
    },
    {
      id: "izakaya",
      label: "居酒屋・粉もの",
      tokens: [
        "yakitori", "okonomiyaki", "お好み焼き", "savory_pancakes", "takoyaki",
        "たこ焼き", "friture", "fried_food", "串カツ", "焼き鳥", "居酒屋", "chicken",
      ],
      nameTokens: ["居酒屋"],
    },
    { id: "italian", label: "イタリアン", tokens: ["italian", "pizza", "pasta", "italian_pizza"] },
    { id: "french", label: "フレンチ", tokens: ["french"] },
    {
      id: "western",
      label: "洋食・欧米",
      tokens: [
        "western", "steak_house", "steak", "burger", "sandwich", "american",
        "german", "spanish", "international", "buffet", "grill", "fine_dining",
      ],
    },
    {
      id: "cafe",
      label: "カフェ・スイーツ",
      tokens: ["coffee_shop", "cake", "ice_cream", "dessert", "tea", "pancake", "crepe", "breakfast"],
    },
    {
      id: "japanese",
      label: "和食",
      tokens: [
        "japanese", "soba", "udon", "tempura", "天ぷら", "tonkatsu", "pork_cutlet",
        "とんかつ", "eel", "うどん", "そば", "蕎麦", "定食", "regional", "local",
        "fish", "seafood", "海鮮",
      ],
    },
    { id: "other", label: "その他", tokens: [] },
  ];
  const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

  function categorizeSpot(spot) {
    const cuisineTokens = (spot.cuisine || "")
      .split(";")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const name = spot.name || "";

    for (const cat of CATEGORIES) {
      if (cat.tokens.some((t) => cuisineTokens.includes(t.toLowerCase()))) return cat.id;
      if (cat.nameTokens && cat.nameTokens.some((t) => name.includes(t))) return cat.id;
    }
    return "other";
  }

  const state = {
    spots: [],
    spotsById: new Map(),
    markersById: new Map(),
    prefVisible: Object.fromEntries(PREFS.map((p) => [p, true])),
    categoryVisible: Object.fromEntries(CATEGORY_IDS.map((id) => [id, true])),
  };

  const map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // デフォルトの右下表示だと下部のフィルタバーに隠れてタップできないため右上に移動する
  map.attributionControl.setPosition("topright");

  const clusterGroup = L.markerClusterGroup();
  clusterGroup.addTo(map);

  function makeIcon() {
    return L.divIcon({
      html: `<div class="spot-marker" style="background:${MARKER_COLOR}"><span>🍴</span></div>`,
      className: "spot-marker-wrapper",
      iconSize: [30, 30],
      popupAnchor: [0, -14],
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function appleMapsSearchUrl(spot) {
    const query = encodeURIComponent(spot.name);
    return `https://maps.apple.com/?q=${query}&ll=${spot.lat},${spot.lng}`;
  }

  function appleMapsDirectionsUrl(spot) {
    return `https://maps.apple.com/?daddr=${spot.lat},${spot.lng}&dirflg=d`;
  }

  function safeWebsiteUrl(rawUrl) {
    if (!rawUrl) return null;
    const firstUrl = String(rawUrl).trim().split(/[\s,;]+/)[0];
    const withScheme = /^https?:\/\//i.test(firstUrl) ? firstUrl : `https://${firstUrl}`;
    try {
      const parsed = new URL(withScheme);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch (_error) {
      return null;
    }
  }

  function buildPopupContent(spot) {
    const parts = [`<div class="spot-popup">`];
    parts.push(`<h3>${escapeHtml(spot.name)}</h3>`);

    const subtitle = [spot.cuisine, spot.pref].filter(Boolean).join(" ・ ");
    if (subtitle) {
      parts.push(`<div class="spot-type">${escapeHtml(subtitle)}</div>`);
    }
    if (spot.address) {
      parts.push(`<div class="spot-address">${escapeHtml(spot.address)}</div>`);
    }
    if (spot.opening_hours) {
      parts.push(`<div class="spot-hours">🕒 ${escapeHtml(spot.opening_hours)}</div>`);
    }
    if (spot.phone) {
      parts.push(`<div class="spot-phone">☎ ${escapeHtml(spot.phone)}</div>`);
    }

    parts.push(`<div class="spot-links">`);
    parts.push(`<a href="${appleMapsSearchUrl(spot)}" target="_blank" rel="noopener">評価を見る(Apple Maps)</a>`);
    parts.push(`<a href="${appleMapsDirectionsUrl(spot)}" target="_blank" rel="noopener">経路案内</a>`);
    const websiteUrl = safeWebsiteUrl(spot.website);
    if (websiteUrl) {
      parts.push(`<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener">公式サイト</a>`);
    }
    parts.push(`</div>`);

    parts.push(`</div>`);
    return parts.join("");
  }

  function rebuildClusters() {
    clusterGroup.clearLayers();
    for (const spot of state.spots) {
      if (!state.prefVisible[spot.pref]) continue;
      if (!state.categoryVisible[spot.category]) continue;
      const marker = state.markersById.get(spot.id);
      clusterGroup.addLayer(marker);
    }
  }

  function focusSpot(spotId) {
    const spot = state.spotsById.get(spotId);
    const marker = state.markersById.get(spotId);
    if (!spot || !marker) return;

    if (!state.prefVisible[spot.pref]) {
      state.prefVisible[spot.pref] = true;
      document.querySelector(`.toggle-btn[data-pref="${spot.pref}"]`).classList.add("active");
    }
    if (!state.categoryVisible[spot.category]) {
      state.categoryVisible[spot.category] = true;
      document.querySelector(`.chip-btn[data-category="${spot.category}"]`).classList.add("active");
    }
    rebuildClusters();

    map.setView([spot.lat, spot.lng], 16);
    if (clusterGroup.zoomToShowLayer) {
      clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  }

  async function loadSpots() {
    const res = await fetch("data/restaurants.json");
    const data = await res.json();
    state.spots = data;

    for (const spot of state.spots) {
      spot.category = categorizeSpot(spot);
      state.spotsById.set(spot.id, spot);
      const marker = L.marker([spot.lat, spot.lng], { icon: makeIcon() });
      marker.bindPopup(() => buildPopupContent(spot));
      state.markersById.set(spot.id, marker);
    }

    rebuildClusters();
  }

  // フィルタUI: 都道府県トグル
  document.querySelectorAll("#pref-filter .toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pref = btn.dataset.pref;
      state.prefVisible[pref] = !state.prefVisible[pref];
      btn.classList.toggle("active", state.prefVisible[pref]);
      rebuildClusters();
    });
  });

  // フィルタUI: ジャンル(カテゴリ)トグル
  const categoryChips = document.getElementById("category-chips");
  for (const cat of CATEGORIES) {
    const btn = document.createElement("button");
    btn.className = "chip-btn active";
    btn.dataset.category = cat.id;
    btn.textContent = cat.label;
    btn.addEventListener("click", () => {
      state.categoryVisible[cat.id] = !state.categoryVisible[cat.id];
      btn.classList.toggle("active", state.categoryVisible[cat.id]);
      rebuildClusters();
    });
    categoryChips.appendChild(btn);
  }

  // 検索
  const searchToggleBtn = document.getElementById("search-toggle-btn");
  const searchPanel = document.getElementById("search-panel");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");

  // ジャンル(カテゴリ)パネル
  const categoryToggleBtn = document.getElementById("category-toggle-btn");
  const categoryPanel = document.getElementById("category-panel");

  searchToggleBtn.addEventListener("click", () => {
    categoryPanel.classList.add("hidden");
    searchPanel.classList.toggle("hidden");
    if (!searchPanel.classList.contains("hidden")) {
      searchInput.focus();
    }
  });

  categoryToggleBtn.addEventListener("click", () => {
    searchPanel.classList.add("hidden");
    categoryPanel.classList.toggle("hidden");
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = "";
    if (!q) return;

    const matches = state.spots.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30);
    for (const spot of matches) {
      const li = document.createElement("li");
      li.innerHTML = `🍴 ${escapeHtml(spot.name)}<span class="spot-pref">${escapeHtml(spot.pref)}</span>`;
      li.addEventListener("click", () => {
        focusSpot(spot.id);
        searchPanel.classList.add("hidden");
        searchInput.value = "";
        searchResults.innerHTML = "";
      });
      searchResults.appendChild(li);
    }
  });

  // 現在地ボタン
  document.getElementById("locate-btn").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], GEOLOCATION_ZOOM);
      },
      () => {},
      { timeout: 8000 }
    );
  });

  loadSpots();
})();
