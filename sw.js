/* =============================================================================
   SERVICE WORKER
   -----------------------------------------------------------------------------
   Un Service Worker es un script que el navegador ejecuta "en segundo plano",
   fuera de la página. Su trabajo aquí es sencillo:
     1) Guardar en caché los archivos estáticos de la app (HTML, manifest,
        iconos) la primera vez que se visita.
     2) Servirlos desde la caché si el móvil no tiene conexión, para que la
        app al menos "abra" aunque no haya datos nuevos.

   IMPORTANTE: los datos de la lista y el calendario NO se guardan aquí.
   Esos viven en Supabase y se sincronizan en tiempo real por internet
   (Realtime), así que el Service Worker no interfiere con eso: solo
   cachea el "esqueleto" visual de la app.

   También gestiona las notificaciones push (mensajes, recordatorio de
   agenda, recordatorio de "salgo del trabajo"): quien las envía de
   verdad son las Edge Functions de Supabase; aquí solo recibimos el
   aviso y lo mostramos en el móvil.
   ============================================================================= */

// Cambia este nombre cada vez que actualices el HTML/CSS para forzar
// que los móviles descarguen la versión nueva en vez de usar la caché vieja.
const CACHE_NAME = 'nuestra-casa-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
  // Si añades icon-192.png, icon-512.png, etc., inclúyelos aquí también.
];

// Evento "install": se dispara una vez, cuando el navegador descubre el SW.
// Aquí guardamos en caché los archivos base de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting(); // activa el nuevo SW inmediatamente, sin esperar a cerrar pestañas
});

// Evento "activate": limpia cachés antiguas de versiones anteriores de la app.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Evento "fetch": intercepta cada petición de red que hace la app.
// Estrategia "network first, fallback a caché": intenta ir a internet
// (para tener siempre la versión más nueva y, sobre todo, para que
// Supabase pueda funcionar con datos en tiempo real); si no hay
// conexión, sirve lo que haya en caché.
self.addEventListener('fetch', (event) => {
  // No interceptamos las peticiones a Supabase: deben ir siempre
  // directas a la red para que el tiempo real funcione bien.
  if (event.request.url.includes('.supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardamos una copia fresca en caché para la próxima vez sin conexión
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* =============================================================================
   NOTIFICACIONES PUSH
   -----------------------------------------------------------------------------
   Evento "push": llega cuando una Edge Function de Supabase manda un aviso
   a este móvil concreto (mensaje nuevo, recordatorio de agenda, o
   recordatorio de "salgo del trabajo"). El payload es el JSON que manda
   la función: { title, body, tag }.
   ============================================================================= */
self.addEventListener('push', (event) => {
  let datos = { title: 'Nuestra Casa', body: 'Tienes una notificación nueva', tag: 'general' };
  try {
    if (event.data) datos = event.data.json();
  } catch (e) {
    // Si el payload no es JSON válido, usamos el texto tal cual como cuerpo.
    if (event.data) datos.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(datos.title || 'Nuestra Casa', {
      body: datos.body || '',
      tag: datos.tag || 'general',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      renotify: true
    })
  );
});

// Al tocar la notificación, abrimos la app (o la enfocamos si ya está abierta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) return cliente.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
