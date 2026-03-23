import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SidebarProvider } from "@/lib/sidebar-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "국무노션 | GukmuNotion",
  description: "AI 기반 국무회의 추적 시민 감시 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistMono.variable} antialiased`}>
        <TooltipProvider>
          <SidebarProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto bg-background">
                  {children}
                </main>
              </div>
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
