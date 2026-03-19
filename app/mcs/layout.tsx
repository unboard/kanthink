import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCS Print Chat",
  description: "MyCreativeShop print product assistant",
};

export default function MCSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override the root dark theme for this standalone page
  return (
    <div
      className="min-h-screen"
      style={{
        background: '#fafafa',
        color: '#171717',
        colorScheme: 'light',
      }}
    >
      {children}
    </div>
  );
}
