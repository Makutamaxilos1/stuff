export const prerender = true;
export const ssr = false;

if (typeof window !== 'undefined' && 'caches' in window) {
  window.addEventListener('load', async () => {
    try {
      // Fetch list of routes
      const routesResponse = await fetch('/routes.json');
      if (!routesResponse.ok) {
        console.error('Failed to fetch routes.json:', routesResponse.status, routesResponse.statusText);
        return;
      }
      const routes = await routesResponse.json();
      console.log('Routes to cache:', routes);

      // Cache all routes
      const cache = await caches.open('pages');
      for (const route of routes) {
        // Normalize route to absolute URL
        const url = new URL(route, window.location.origin).href;
        try {
          const response = await fetch(url, { mode: 'no-cors' }); // Use no-cors to avoid CORS issues
          if (response.ok) {
            await cache.put(url, response.clone());
            console.log(`Cached route: ${url}`);
          } else {
            console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
          }
        } catch (e) {
          console.error(`Failed to cache ${url}:`, e.message);
        }
      }

      // Cache static and dynamic assets
      const assetCache = await caches.open('assets');
      const staticAssets = [
        '/manifest.webmanifest',
        '/pwa-192x192.png',
        '/pwa-512x512.png',
        '/favicon.png',
        '/leaflet/leaflet.css',
        '/leaflet/leaflet.js',
        '/leaflet/MarkerCluster.css',
        '/leaflet/MarkerCluster.Default.css',
      ];

      // Fetch dynamic assets (JS, CSS) from initial page load
      const assetUrls = [];
      try {
        const htmlResponse = await fetch('/', { mode: 'no-cors' });
        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          const jsRegex = /\/assets\/[^"]+\.js/g;
          const cssRegex = /\/assets\/[^"]+\.css/g;
          assetUrls.push(...(html.match(jsRegex) || []));
          assetUrls.push(...(html.match(cssRegex) || []));
        }
      } catch (e) {
        console.error('Failed to fetch / for asset discovery:', e.message);
      }

      for (const asset of [...staticAssets, ...assetUrls]) {
        const assetUrl = new URL(asset, window.location.origin).href;
        try {
          const response = await fetch(assetUrl, { mode: 'no-cors' });
          if (response.ok) {
            await assetCache.put(assetUrl, response.clone());
            console.log(`Cached asset: ${assetUrl}`);
          } else {
            console.error(`Failed to fetch ${assetUrl}: ${response.status} ${response.statusText}`);
          }
        } catch (e) {
          console.error(`Failed to cache ${assetUrl}:`, e.message);
        }
      }
    } catch (e) {
      console.error('Caching process failed:', e.message);
    }
  });

  // Serve cached content when offline
  window.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request).catch(async () => {
          const cache = await caches.open('pages');
          // Normalize request URL to match cached URL
          const url = new URL(event.request.url).pathname;
          const cachedResponse = await cache.match(url);
          if (cachedResponse) {
            console.log(`Serving cached route: ${url}`);
            return cachedResponse;
          }
          console.warn(`No cached response for ${url}`);
          return new Response('Offline and no cached content available', { status: 503 });
        })
      );
    } else {
      event.respondWith(
        fetch(event.request).catch(async () => {
          const cache = await caches.open('assets');
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            console.log(`Serving cached asset: ${event.request.url}`);
            return cachedResponse;
          }
          console.warn(`No cached asset for ${event.request.url}`);
          return fetch(event.request); // Fallback to network (fails offline)
        })
      );
    }
  });
}