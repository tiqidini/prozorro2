"use client";
import { useState } from "react";
import { Search as SearchIcon, Filter, Building2, Calendar, Banknote } from "lucide-react";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  // Тестовые данные
  const mockTenders = [
    {
      id: "1",
      title: "Закупка офисной техники",
      organizer: "КМДА",
      value: "150,000 UAH",
      date: "22.01.2026",
    },
    {
      id: "2",
      title: "Ремонт дорожного покрытия",
      organizer: "Укравтодор",
      value: "4,200,000 UAH",
      date: "21.01.2026",
    },
  ];

  return (
    <div className="px-4">
      {/* Header */}
      <header className="py-4 sticky top-0 bg-gray-50 z-10">
        <h1 className="text-2xl font-bold mb-4">Поиск тендеров</h1>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Ключевые слова..."
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Quick Filters */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
          {["Все", "Активные", "Завершенные", "Избранные"].map((f) => (
            <button
              key={f}
              className="px-4 py-2 bg-white rounded-full text-sm font-medium whitespace-nowrap shadow-sm border border-gray-100"
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* Tender List */}
      <div className="space-y-3 mt-2">
        {mockTenders.map((tender) => (
          <div key={tender.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 active:scale-[0.98] transition-transform">
            <h3 className="font-semibold text-lg leading-tight mb-2">{tender.title}</h3>
            
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-500">
                <Building2 size={16} className="mr-2" />
                <span>{tender.organizer}</span>
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Banknote size={16} className="mr-2" />
                <span className="font-medium text-blue-600">{tender.value}</span>
              </div>
              <div className="flex items-center text-sm text-gray-400">
                <Calendar size={16} className="mr-2" />
                <span>{tender.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}