import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",  // Включаем режим статического экспорта для GitHub Pages
  basePath: "/prozorro", // Указываем имя репозитория как базовый путь
  images: {
    unoptimized: true, // Отключаем оптимизацию картинок (требует Node.js сервера)
  },
};

export default nextConfig;