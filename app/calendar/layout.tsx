import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marketing Calendar',
  description: 'AI-driven marketing calendar — plan the ideas that grow revenue.',
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#f6f7f9', color: '#171717', colorScheme: 'light' }}>
      {children}
    </div>
  );
}
