'use client';

import { NavPanel } from './NavPanel';
import { useNav } from '@/components/providers/NavProvider';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

export function NotificationsPanel() {
  const { closePanel } = useNav();

  return (
    <NavPanel panelKey="notifications" title="Notifications" width="md">
      <NotificationCenter onClose={closePanel} />
    </NavPanel>
  );
}
