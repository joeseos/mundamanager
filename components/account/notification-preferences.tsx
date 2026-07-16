'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { updateNotificationPreference } from '@/app/actions/user';
import {
  notificationEmailConfig,
  emailEligibleTypes,
  MASTER_PREF_KEY,
  type NotificationType,
} from '@/utils/notifications/email-config';

type PreferenceRow = { notification_type: string; enabled: boolean };

interface NotificationPreferencesProps {
  initialPreferences: PreferenceRow[];
}

export default function NotificationPreferences({
  initialPreferences,
}: NotificationPreferencesProps) {
  // Build the initial UI state: master defaults on, each category defaults to its
  // config default when the user has no stored row.
  const prefFor = (type: string, fallback: boolean) => {
    const row = initialPreferences.find((p) => p.notification_type === type);
    return row ? row.enabled : fallback;
  };

  const [master, setMaster] = useState<boolean>(prefFor(MASTER_PREF_KEY, true));
  const [categories, setCategories] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const type of emailEligibleTypes()) {
      state[type] = prefFor(type, notificationEmailConfig[type].defaultEnabled);
    }
    return state;
  });
  const [pending, setPending] = useState<string | null>(null);

  const persist = async (
    type: string,
    value: boolean,
    revert: () => void,
  ) => {
    setPending(type);
    try {
      const result = await updateNotificationPreference(type, value);
      if (result?.error) {
        revert();
        toast.error(result.error);
      }
    } catch {
      revert();
      toast.error('Failed to update preference');
    } finally {
      setPending(null);
    }
  };

  const onMasterChange = (value: boolean) => {
    const previous = master;
    setMaster(value); // optimistic
    persist(MASTER_PREF_KEY, value, () => setMaster(previous));
  };

  const onCategoryChange = (type: NotificationType, value: boolean) => {
    const previous = categories[type];
    setCategories((c) => ({ ...c, [type]: value })); // optimistic
    persist(type, value, () =>
      setCategories((c) => ({ ...c, [type]: previous })),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Email notifications</p>
          <p className="text-sm text-muted-foreground">
            Turn all optional notification emails on or off. Security and account
            emails (like password resets) are always sent.
          </p>
        </div>
        <Switch
          checked={master}
          onCheckedChange={onMasterChange}
          disabled={pending === MASTER_PREF_KEY}
          aria-label="Toggle all email notifications"
        />
      </div>

      <div className="space-y-3 border-t pt-3">
        {emailEligibleTypes().map((type) => (
          <div key={type} className="flex items-center justify-between gap-4">
            <label
              htmlFor={`notif-pref-${type}`}
              className="text-sm text-foreground"
            >
              {notificationEmailConfig[type].label}
            </label>
            <Switch
              id={`notif-pref-${type}`}
              checked={master && categories[type]}
              onCheckedChange={(value) => onCategoryChange(type, value)}
              disabled={!master || pending === type}
              aria-label={`Toggle emails for ${notificationEmailConfig[type].label}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
