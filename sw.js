// STABLE_ASSETS(ライブラリ等ほぼ変更しないファイル)の中身を変えたときだけこの番号を上げる。
// index.html/css/style.css/js/app.js/data/restaurants.jsonはnetwork-firstなので、
// これらを変更してもCACHE_NAMEを上げる必要はない(オンラインなら常に最新を取得する)。
const CACHE_NAME = "kinki-gourmet-map-v1";

const STABLE_ASSETS = [
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/markercluster/MarkerCluster.css",
  "./vendor/markercluster/MarkerCluster.Default.css",
  "./vendor/markercluster/leaflet.markercluster.js",
];

const NETWORK_FIRST_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./data/restaurants.json",
];

const ALL_ASSETS = [...STABLE_ASSETS, ...NETWORK_FIRST_ASSETS];

const NETWORK_FIRST_PATHS = new Set(
  NETWORK_FIRST_ASSETS.map((url) => new URL(url, self.location.href).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ALL_ASSETS.map((url) => fetch(url).then((response) => cache.put(url, response)))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 地図タイルなど外部ホストへのリクエストはキャッシュしない
  if (url.origin !== self.location.origin) {
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
