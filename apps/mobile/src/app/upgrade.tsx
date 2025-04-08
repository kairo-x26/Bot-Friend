import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, Screen, Tactile, Text } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useSubscription, useVerifyPurchase } from '@/lib/api/hooks';
import { usePrefs } from '@/lib/prefs';
import { loadPlans, purchase, restorable, usingTestStore, type PlanId } from '@/lib/purchases';
import { useTheme } from '@/theme/theme';

const PERKS = ['Up to 600 messages a day', 'Longer voice chats', 'New mascot colors and outfits first'];

export default function Upgrade() {
  const t = useTheme();
  const color = usePrefs((s) => s.prefs.mascotColor);
  const sub = useSubscription();
  const plans = useQuery({ queryKey: ['plans'], queryFn: loadPlans, staleTime: Infinity });
  const verify = useVerifyPurchase();
  const [selected, setSelected] = useState<PlanId>('botfriend.premium.yearly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const premium = sub.data?.entitlement === 'premium';

  async function buy() {
    setBusy('buy');
    setMessage(null);
    try {
      const { body, finish } = await purchase(selected);
      await verify.mutateAsync(body);
      await finish();
      setMessage('You’re premium now. Thank you for supporting Bot-Friend!');
    } catch (err) {
      if ((err as { cancelled?: boolean }).cancelled) return;
      setMessage(err instanceof ApiClientError ? err.message : 'The purchase didn’t go through. You haven’t been charged.');
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy('restore');
    setMessage(null);
    try {
      const found = await restorable();
      if (found.length === 0) {
        setMessage('No previous purchases found for this store account.');
        return;
      }
      for (const body of found) await verify.mutateAsync(body);
      setMessage('Purchases restored.');
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Restore didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Bot-Friend Premium" headerRight={<IconButton icon="close" label="Close" onPress={() => router.back()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
        <Mascot size={88} mood="laughing" color={color} />
        <View style={{ flex: 1, gap: t.space[1] }}>
          {PERKS.map((p) => (
            <Text key={p} weight="medium">
              ✦ {p}
            </Text>
          ))}
        </View>
      </View>

      {premium ? (
        <View style={{ padding: t.space[5], borderRadius: t.radius.card, backgroundColor: t.dark ? t.colors.surfaceRaised : t.colors.accentCalm, gap: t.space[2] }}>
          <Text variant="subheading" display weight="semibold" tone="calm">
            You’re premium
          </Text>
          <Text tone="calm">
            {sub.data?.subscription?.expiresAt ? `Renews or ends on ${new Date(sub.data.subscription.expiresAt).toLocaleDateString()}.` : 'Thanks for your support.'} Manage it in your store account settings.
          </Text>
        </View>
      ) : plans.isLoading ? (
        <ActivityIndicator color={t.colors.primary} />
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Plan" style={{ gap: t.space[3] }}>
          {(plans.data ?? []).map((plan) => {
            const active = plan.id === selected;
            return (
              <Tactile
                key={plan.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${plan.title}, ${plan.price} ${plan.note}`}
                onPress={() => setSelected(plan.id)}
                haptic="select"
                squish={0.98}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: t.space[4],
                  borderRadius: t.radius.card,
                  borderWidth: 2,
                  borderColor: active ? t.colors.primary : t.colors.border,
                  backgroundColor: t.colors.surface,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" display weight="semibold">
                    {plan.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {plan.note}
                  </Text>
                </View>
                <Text variant="heading">{plan.price}</Text>
              </Tactile>
            );
          })}
        </View>
      )}

      {message ? (
        <Text accessibilityLiveRegion="polite" weight="medium">
          {message}
        </Text>
      ) : null}

      {!premium ? (
        <View style={{ gap: t.space[2] }}>
          <Button label="Subscribe" size="lg" loading={busy === 'buy'} disabled={!!busy} onPress={buy} testID="upgrade-subscribe" />
          <Button label="Restore purchases" variant="ghost" loading={busy === 'restore'} disabled={!!busy} onPress={restore} />
          <Text variant="caption" tone="muted">
            Payment is charged to your {usingTestStore ? 'test store' : 'App Store or Google Play'} account. Subscriptions renew automatically until cancelled in your store settings. The free plan stays free.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
