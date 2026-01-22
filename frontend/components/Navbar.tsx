"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart, Settings } from "lucide-react";

const Navbar = () => {
  const pathname = usePathname();

  const navItems = [
    { name: "Поиск", href: "/", icon: Search },
    { name: "Отслеживаемое", href: "/favorites", icon: Heart },
    { name: "Настройки", href: "/settings", icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)] z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                isActive ? "text-blue-600" : "text-gray-500"
              }`}
            >
              <Icon size={24} />
              <span className="text-[10px] mt-1 font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default Navbar;
