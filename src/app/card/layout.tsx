import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All In Capital",
  description: "A deal from All In Capital.",
  robots: { index: false, follow: false },
};

export default function CardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
