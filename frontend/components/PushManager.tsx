"use client";
import { useEffect } from "react";

const PUBLIC_VAPID_KEY = "BFsoyu1maj8_P8CKXhpanaGpRbjaTZeK-JVwhB1PdFeWuW4Ri0rWxuMm5li2a2RlkZCBcClWS4OenIfD7CMcLGU";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PushManager = () => {
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      registerAndSubscribe();
    }
  }, []);

  const registerAndSubscribe = async () => {
    try {
      // 1. Регистрация SW
      const registration = await navigator.serviceWorker.register("/prozorro/sw.js", { scope: "/prozorro/" });
      console.log("Service Worker registered");

      // 2. Ожидание активации (чтобы pushManager был доступен)
      await navigator.serviceWorker.ready;

      // 3. Проверка существующей подписки
      let subscription = await registration.pushManager.getSubscription();

      // 4. Если нет подписки - подписываемся
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
        });
      }

      // 5. Отправка на бэкенд
      await saveSubscription(subscription);

    } catch (error) {
      console.error("Push Error:", error);
    }
  };

  const saveSubscription = async (subscription: PushSubscription) => {
    // Сериализация PushSubscription в JSON формат, ожидаемый бэкендом
    const body = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.toJSON().keys?.p256dh,
            auth: subscription.toJSON().keys?.auth
        }
    };
    
    // Бэкенд ожидает плоскую структуру, поэтому адаптируем
    const payload = {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_id: "anonymous-user" // В MVP пока нет логина
    };

    try {
        await fetch(`${API_URL}/api/push/subscribe`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        console.log("Subscription saved on backend");
    } catch (err) {
        console.error("Failed to save subscription:", err);
    }
  };

  return null;
};

export default PushManager;