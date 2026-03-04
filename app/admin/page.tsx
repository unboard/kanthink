import Link from 'next/link';

const tools = [
  {
    label: 'Email Templates',
    description: 'Preview and test transactional email templates',
    href: '/admin/emails',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
];

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 flex items-start gap-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
          >
            <div className="text-neutral-500 dark:text-neutral-400">
              {tool.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {tool.label}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {tool.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
