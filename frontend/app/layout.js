import './globals.css'
import { SettingsProvider } from '@/src/components/SettingsContext'

export default function RootLayout({ children }) {
    return (
        <html lang="en">
        <body>
        <SettingsProvider>
            {children}
        </SettingsProvider>
        </body>
        </html>
    );
}