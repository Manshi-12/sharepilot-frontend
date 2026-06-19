import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SharePilot — Your Intelligent SharePoint Assistant",
  description: "AI-powered SharePoint assistant built on Azure AI Foundry",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&family=Manrope:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}