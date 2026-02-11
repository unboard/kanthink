import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MiniNav } from "@/components/layout/MiniNav";
import { ChannelsPanel } from "@/components/layout/ChannelsPanel";
import { ShroomsPanel } from "@/components/layout/ShroomsPanel";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
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
import { GlobalNewChannelOverlay } from "@/components/layout/GlobalNewChannelOverlay";

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
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg", type: "image/svg+xml" },
      { url: "https://res.cloudinary.com/dcht3dytz/image/upload/w_32,h_32,f_png/v1769532115/kanthink-icon_pbne7q", sizes: "32x32", type: "image/png" },
      { url: "https://res.cloudinary.com/dcht3dytz/image/upload/w_192,h_192,f_png/v1769532115/kanthink-icon_pbne7q", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "https://res.cloudinary.com/dcht3dytz/image/upload/w_180,h_180,f_png/v1769532115/kanthink-icon_pbne7q", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kanthink",
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
                    <NotificationsPanel />

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

                  {/* Global new channel overlay - triggered from nav buttons */}
                  <GlobalNewChannelOverlay />
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
