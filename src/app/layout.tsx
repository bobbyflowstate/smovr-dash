import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthenticatedApp from "./AuthenticatedApp";
import { ThemeProvider } from "@/components/ThemeProvider";
import ConditionalLayout from "@/components/ConditionalLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AZ Medical",
  description: "Secure healthcare data management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors`}>
        <ThemeProvider>
          <AuthenticatedApp>
            <ConditionalLayout>
              {children}
            </ConditionalLayout>
          </AuthenticatedApp>
        </ThemeProvider>
      </body>
    </html>
  );
}
