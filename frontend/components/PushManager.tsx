"use client";
import { useEffect } from "react";

const PushManager = () => {
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker зарегистрирован:", registration);
    } catch (error) {
      console.error("Ошибка регистрации Service Worker:", error);
    }
  };

  return null; // Компонент не имеет UI
};

export default PushManager;
