import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { AmbientBackground } from "@/components/ambient/AmbientBackground";
import { AIStatusBar } from "@/components/AIStatusBar";
import { AutomationProvider } from "@/components/providers/AutomationProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SidebarProvider } from "@/components/providers/SidebarProvider";
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
                <SidebarProvider>
                <div className="relative z-10 flex h-screen">
                  <Sidebar />
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <MobileHeader />
                    <main className="flex-1 overflow-auto">
                      {children}
                    </main>
                  </div>
                  <AIStatusBar />
                </div>
                </SidebarProvider>
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
