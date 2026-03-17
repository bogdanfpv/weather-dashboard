"use client";

import React, { useState } from 'react';
import { useSettings } from '@/src/components/SettingsContext';
import Sidebar from '@/src/components/Sidebar';
import SidebarToggleButton from '@/src/components/SidebarToggleButton';

export default function SettingsPage() {
    const { theme, toggleTheme } = useSettings();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className={`flex min-h-screen ${theme === 'blue' ? 'bg-gradient-to-b from-blue-500 via-blue-600 to-blue-800' : 'bg-gradient-to-b from-gray-900 via-gray-800 to-black'}`}>
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
            />

            <div className="container mx-auto px-4 py-6 max-w-6xl">
                <header className="text-center mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <SidebarToggleButton setIsSidebarOpen={setIsSidebarOpen} />
                        <h1 className="text-4xl font-bold text-white flex-1">Settings</h1>
                        <div className="w-10"></div>
                    </div>
                </header>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                        <span className="text-white text-lg">Theme</span>
                        <button
                            onClick={toggleTheme}
                            className="bg-white/20 hover:bg-white/30 text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            {theme === 'blue' ? 'Blue' : 'Dark'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}