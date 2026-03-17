import { X } from "lucide-react";
import React from "react";
import Link from "next/link";

const Sidebar = ({ setIsSidebarOpen, isSidebarOpen }) => {
  if (!isSidebarOpen || !setIsSidebarOpen) return null;

  return (
    <div
      data-testid="sidebar"
      className={`
    fixed inset-y-0 left-0 z-50 w-64 bg-white/10 backdrop-blur-md border-r border-white/20 p-6 transform transition-transform duration-300 ease-in-out flex flex-col
    ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
`}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">WeatherApp</h2>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="lg:hidden text-white hover:bg-white/20 p-1 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="space-y-2 flex-1">
        <Link
          href="/"
          onClick={() => setIsSidebarOpen(false)}
          className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left"
        >
          Dashboard
        </Link>
        <Link
          href="/settings"
          onClick={() => setIsSidebarOpen(false)}
          className="block text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors w-full text-left"
        >
          Settings
        </Link>
      </nav>

      <div className="mt-auto pt-4 space-y-2">
        <button
          type="button"
          className="block text-white/40 px-3 py-2 rounded-lg w-full text-left cursor-not-allowed"
          disabled
        >
          Historical Data
        </button>
        <button
          type="button"
          className="block text-white/40 px-3 py-2 rounded-lg w-full text-left cursor-not-allowed"
          disabled
        >
          Weather Alerts
        </button>
      </div>

      <div className="mt-auto pt-4 border-t border-white/20">
        <button
          type="button"
          className="block text-white/40 px-3 py-2 rounded-lg w-full text-left font-medium cursor-not-allowed" disabled
        >
          Login
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
