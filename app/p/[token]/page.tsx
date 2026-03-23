import { db } from '@/lib/db';
import { contentPages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;

  try {
    const page = await db.query.contentPages?.findFirst({
      where: eq(contentPages.token, token),
    });

    if (!page) return { title: 'Page Not Found' };

    return {
      title: page.title || 'Kanthink Page',
      description: page.description || undefined,
    };
  } catch {
    return { title: 'Kanthink Page' };
  }
}

export default async function ContentPage({ params }: PageProps) {
  const { token } = await params;

  let page;
  try {
    page = await db.query.contentPages?.findFirst({
      where: eq(contentPages.token, token),
    });
  } catch {
    // Table might not exist yet
    notFound();
  }

  if (!page) {
    notFound();
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#fafaf9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', minHeight: '100vh' }}>
          {/* Header */}
          <div style={{ borderBottom: '1px solid #e7e5e4', padding: '24px 32px' }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1c1917', margin: 0 }}>
              {page.title}
            </h1>
            {page.description && (
              <p style={{ fontSize: 15, color: '#78716c', marginTop: 8 }}>
                {page.description}
              </p>
            )}
            <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 12 }}>
              {page.channelName && `From ${page.channelName}`}
              {page.createdAt && ` · ${new Date(page.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
            </div>
          </div>

          {/* Content */}
          <div
            style={{ padding: '32px 32px 64px' }}
            dangerouslySetInnerHTML={{ __html: page.htmlContent || '' }}
          />

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e7e5e4', padding: '16px 32px', textAlign: 'center' as const }}>
            <p style={{ fontSize: 12, color: '#a8a29e', margin: 0 }}>
              Made with <a href="https://www.kanthink.com" style={{ color: '#7c3aed', textDecoration: 'none' }}>Kanthink</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
