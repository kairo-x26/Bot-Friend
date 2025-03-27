import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, Divider, ListRow, Screen, Section, Segmented, Sheet, Text, Toggle } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useDeleteAccount, useFeatures, useUpdatePreferences, useUsage } from '@/lib/api/hooks';
import { downloadMyData } from '@/lib/exportData';
import { usePrefs } from '@/lib/prefs';
import { registerForReminders } from '@/lib/push';
import { localHourToUtc, utcHourToLocal } from '@/lib/time';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';
import { useQueryClient } from '@tanstack/react-query';

export default function Profile() {
  const t = useTheme();
  const qc = useQueryClient();
  const session = useSession();
  const prefs = usePrefs((s) => s.prefs);
  const update = useUpdatePreferences();
  const usage = useUsage();
  const deleteAccount = useDeleteAccount();
  const features = useFeatures();
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const REMINDER_TIMES = [
    { value: '9', label: 'Morning' },
    { value: '14', label: 'Afternoon' },
    { value: '19', label: 'Evening' },
  ];
  const localReminder = prefs.reminderHour === null ? '19' : String(utcHourToLocal(prefs.reminderHour));
  const reminderChoice = REMINDER_TIMES.some((o) => o.value === localReminder) ? localReminder : '19';

  async function toggleReminders(on: boolean) {
    setNotice(null);
    if (on) {
      const res = await registerForReminders().catch(() => 'unsupported' as const);
      if (res === 'denied') {
        setNotice('Notifications are off for Bot-Friend in your phone settings.');
        return;
      }
      if (res === 'unsupported') setNotice('Reminders arrive on your phone once the app is installed there.');
    }
    update.mutate({ remindersEnabled: on, reminderHour: localHourToUtc(Number(reminderChoice)) });
  }

  async function exportData() {
    setExporting(true);
    setNotice(null);
    try {
      await downloadMyData();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : 'Download didn’t start. Try again.');
    } finally {
      setExporting(false);
    }
  }
  const user = session.user;
  const guest = user?.isGuest ?? false;

  const used = usage.data?.messagesUsed ?? 0;
  const limit = usage.data?.messagesLimit ?? 0;
  const pct = limit ? Math.min(1, used / limit) : 0;

  async function signOut() {
    qc.clear();
    await session.signOut();
  }

  /** Guests keep their guest token so the new account inherits their chats. */
  async function createAccount() {
    qc.clear();
    await session.signOut({ forgetGuest: false });
  }

  async function confirmDeletion() {
    setDeleteError(null);
    try {
      await deleteAccount.mutateAsync();
      qc.clear();
      await session.setOnboarded(false);
      await session.signOut({ forgetGuest: true });
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Deletion didn’t start. Try again.');
    }
  }

  return (
    <Screen title="Profile">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
        <Mascot size={64} mood="happy" color={prefs.mascotColor} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{guest ? 'Guest' : (user?.displayName ?? 'You')}</Text>
          <Text tone="muted" variant="callout">
            {guest ? 'Trying Bot-Friend out' : `Signed in with ${user?.provider === 'apple' ? 'Apple' : user?.provider === 'google' ? 'Google' : 'email'}`}
          </Text>
        </View>
      </View>

      {usage.data ? (
        <View accessible accessibilityLabel={`${used} of ${limit} messages used today`} style={{ gap: t.space[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text weight="medium">Messages today</Text>
            <Text tone="muted">
              {used} of {limit}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: t.colors.backgroundAlt, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 5, backgroundColor: pct > 0.85 ? t.colors.accentWarm : t.colors.primary }} />
          </View>
          <Text variant="caption" tone="muted">
            Resets at midnight UTC.
          </Text>
        </View>
      ) : null}

      {!guest && features.data?.billing ? (
        <ListRow
          icon="sparkle"
          label={usage.data?.entitlement === 'premium' ? 'Premium' : 'Get Premium'}
          detail={usage.data?.entitlement === 'premium' ? 'Thanks for your support' : 'More messages a day and early features'}
          onPress={() => router.push('/upgrade')}
          testID="profile-upgrade"
        />
      ) : null}

      {guest ? (
        <View style={{ padding: t.space[5], borderRadius: t.radius.card, backgroundColor: t.colors.primarySoft, gap: t.space[3] }}>
          <Text variant="subheading" display weight="semibold">
            Keep your chats
          </Text>
          <Text tone="muted">Guest chats disappear after 7 days. A free account keeps them and raises your daily limit.</Text>
          <Button label="Create a free account" onPress={createAccount} testID="profile-create-account" />
        </View>
      ) : null}

      <Section title="Appearance">
        <View style={{ paddingVertical: t.space[3] }}>
          <Segmented
            label="Theme"
            value={prefs.theme}
            onChange={(theme) => update.mutate({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
        <Divider />
        <Toggle label="Reduce motion" description="Turns off the mascot’s idle animation and screen transitions." value={prefs.reducedMotion} onChange={(reducedMotion) => update.mutate({ reducedMotion })} />
        <Divider />
        <Toggle label="Larger text" value={prefs.largeText} onChange={(largeText) => update.mutate({ largeText })} />
        {Platform.OS !== 'web' ? (
          <>
            <Divider />
            <Toggle label="Haptics" value={prefs.hapticsEnabled} onChange={(hapticsEnabled) => update.mutate({ hapticsEnabled })} />
          </>
        ) : null}
      </Section>

      {!guest ? (
        <Section title="Reminders">
          <Toggle
            label="A gentle daily nudge"
            description="At most once a day, and never if you’ve already been chatting."
            value={prefs.remindersEnabled}
            onChange={toggleReminders}
            testID="toggle-reminders"
          />
          {prefs.remindersEnabled ? (
            <View style={{ paddingBottom: t.space[3] }}>
              <Segmented
                label="Reminder time"
                value={reminderChoice}
                onChange={(v) => update.mutate({ reminderHour: localHourToUtc(Number(v)) })}
                options={REMINDER_TIMES}
              />
            </View>
          ) : null}
        </Section>
      ) : null}

      {notice ? <Text tone="muted" accessibilityLiveRegion="polite">{notice}</Text> : null}

      <Section title="Privacy">
        {features.data?.memory ? (
          <>
            <ListRow icon="brain" label="Memories" detail={prefs.memoryEnabled ? 'On' : 'Off'} onPress={() => router.push('/memories')} testID="profile-memories" />
            <Divider />
          </>
        ) : null}
        <ListRow icon="download" label="Download my data" detail={exporting ? 'Preparing…' : 'Chats, settings and memories as JSON'} onPress={exporting ? undefined : exportData} testID="profile-export" />
        <Divider />
        <ListRow icon="trash" label="Delete account" detail="Removes your chats, settings and memories" tone="danger" onPress={() => setDeleteStep(1)} testID="profile-delete" />
      </Section>

      <View style={{ gap: t.space[2] }}>
        <Text variant="caption" tone="muted">
          Bot-Friend is an AI and can get things wrong. It isn’t a substitute for professional help. Version {Constants.expoConfig?.version ?? 'dev'}.
        </Text>
        <Button label="Sign out" variant="secondary" onPress={signOut} testID="profile-signout" />
      </View>

      <Sheet visible={deleteStep > 0} onClose={() => setDeleteStep(0)} title={deleteStep === 1 ? 'Delete your account?' : 'Are you sure?'}>
        <View style={{ gap: t.space[4] }}>
          {deleteStep === 1 ? (
            <>
              <Text tone="muted">
                This signs you out everywhere and permanently deletes your conversations, preferences and memories. It can’t be undone.
              </Text>
              <Button label="Continue" variant="danger" onPress={() => setDeleteStep(2)} testID="delete-continue" />
            </>
          ) : (
            <>
              <Text tone="muted">Last check. Your account will be deleted right away.</Text>
              {deleteError ? <Text tone="danger">{deleteError}</Text> : null}
              <Button label="Delete my account" variant="danger" loading={deleteAccount.isPending} onPress={confirmDeletion} testID="delete-confirm" />
            </>
          )}
          <Button label="Keep my account" variant="ghost" onPress={() => setDeleteStep(0)} />
        </View>
      </Sheet>
    </Screen>
  );
}
