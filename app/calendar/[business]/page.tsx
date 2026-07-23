import { notFound } from 'next/navigation';
import { CalendarApp } from '@/components/calendar/CalendarApp';
import { getBusiness } from '@/lib/calendar/types';

export default async function BusinessCalendarPage({
  params,
}: {
  params: Promise<{ business: string }>;
}) {
  const { business: slug } = await params;
  const business = getBusiness(slug.toLowerCase());
  if (!business) notFound();
  return <CalendarApp business={business} />;
}
