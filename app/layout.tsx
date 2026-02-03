import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MiniNav } from "@/components/layout/MiniNav";
import { ChannelsPanel } from "@/components/layout/ChannelsPanel";
import { ShroomsPanel } from "@/components/layout/ShroomsPanel";
import { AccountPanel } from "@/components/layout/AccountPanel";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { MobileBottomSheet } from "@/components/layout/MobileBottomSheet";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { MainContent } from "@/components/layout/MainContent";
import { AmbientBackground } from "@/components/ambient/AmbientBackground";
import { AIStatusBar } from "@/components/AIStatusBar";
import { AutomationProvider } from "@/components/providers/AutomationProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { NavProvider } from "@/components/providers/NavProvider";
import { ServerSyncProvider } from "@/components/providers/ServerSyncProvider";
import { ToastContainer, SignUpOverlay } from "@/components/ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kanthink",
  description: "AI-driven Kanban channels",
  icons: {
    icon: "https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-theme="spores">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AmbientBackground />
          <AuthProvider>
            <ServerSyncProvider>
              <AutomationProvider>
                <NavProvider>
                  <div className="relative z-10 flex h-screen">
                    {/* Desktop: Icon rail always visible */}
                    <MiniNav />

                    {/* Panels - render based on activePanel */}
                    <ChannelsPanel />
                    <ShroomsPanel />
                    <AccountPanel />
                    <SettingsPanel />

                    {/* Main content - margin adjusts when panel open */}
                    <MainContent>
                      <MobileHeader />
                      <main className="flex-1 overflow-auto">
                        {children}
                      </main>
                    </MainContent>

                    <AIStatusBar />
                  </div>

                  {/* Mobile bottom sheet (opens from bottom nav) */}
                  <MobileBottomSheet />
                </NavProvider>
                <ToastContainer />
                <SignUpOverlay />
              </AutomationProvider>
            </ServerSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
