import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Reader",
  description: "Section-based audiobook parts with sync",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
