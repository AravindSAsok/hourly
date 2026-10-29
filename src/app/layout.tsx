import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hourly — Work time, clearly tracked", template: "%s | Hourly" },
  description: "A calm, reliable way to track work sessions, breaks, and weekly progress.",
  icons: { icon: "/hourly-mark.svg" },
};

// Browser extensions such as Dark Reader can inject attributes on <html> before hydration.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
