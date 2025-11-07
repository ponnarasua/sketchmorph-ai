import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexReactClient } from "convex/react";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/convex/provider";

import "./globals.css";
import { ThemeProvider } from "@/theme/provider";
import { Toaster } from "@/components/ui/sonner";
import ReduxProvider from "@/redux/provider";
import { ProfileQuery } from "@/convex/query.config";
import { ConvexUserRaw, normalizeProfile } from "@/types/user";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SketchMorph AI",
  description: "Made for designers, by a designer.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rawProfile = await ProfileQuery();
  const profile = normalizeProfile(
    rawProfile._valueJSON as unknown as ConvexUserRaw | null
  );
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className=" bg-background">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ConvexClientProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <ReduxProvider preloadedState={{ profile }}>
                {children}
                <Toaster />
              </ReduxProvider>
            </ThemeProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
