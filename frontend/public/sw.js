self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/prozorro/icons/icon-192x192.png',
      badge: '/prozorro/icons/icon-192x192.png',
      data: {
        url: data.url || '/prozorro/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
    
    // Попытка обновить Badge API (если поддерживается)
    if (navigator.setAppBadge) {
        navigator.setAppBadge(1).catch(() => {});
    }
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
