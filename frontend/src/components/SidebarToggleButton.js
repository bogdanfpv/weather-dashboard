"use client";
import React from "react";
import { Menu } from "lucide-react";

const SidebarToggleButton = ({ setIsSidebarOpen }) => {
  if (!setIsSidebarOpen) return null;

  return (
    <button
      aria-label="menu"
      onClick={() => setIsSidebarOpen(true)}
      className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
};

export default SidebarToggleButton;