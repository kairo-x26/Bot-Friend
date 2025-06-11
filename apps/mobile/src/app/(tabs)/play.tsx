import { GAMES, type GameId, type GameInfo } from '@bot-friend/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BoundaryPicker } from '@/components/BoundaryPicker';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, Icon, Screen, Sheet, Tactile, Text } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useCreateConversation, useUpdatePreferences } from '@/lib/api/hooks';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/theme';

const ORDER: GameId[] = [
  'joke_battle',
  'silly_quiz',
  'would_you_rather',
  'story_builder',
  'roast_me',
];

export default function Play() {
  const t = useTheme();
  const prefs = usePrefs((s) => s.prefs);
  const create = useCreateConversation();
  const updatePrefs = useUpdatePreferences();
  const [roastSheet, setRoastSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stub: Record<GameId, string> = {
    joke_battle: t.colors.accentWarm,
    would_you_rather: t.dark ? '#3E6B57' : t.colors.accentCalm,
    story_builder: t.dark ? t.colors.primarySoft : '#C8B6FF',
    roast_me: t.dark ? '#5A3340' : '#FFC9BC',
    silly_quiz: t.dark ? '#5C4A1E' : '#FFE6A3',
  };

  async function start(game: GameInfo) {
    setError(null);
    if (game.requiresRoastOptIn && !prefs.roastOptIn) {
      setRoastSheet(true);
      return;
    }
    try {
      const convo = await create.mutateAsync({ mode: game.id });
      router.push({ pathname: '/chat/[id]', params: { id: convo.id } });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Couldn’t start the game. Try again.');
    }
  }

  return (
    <Screen
      title="Play"
      subtitle="Quick games for when you need a laugh."
      headerRight={<Mascot size={64} mood="laughing" color={prefs.mascotColor} interactive />}
    >
      {error ? <Text tone="danger">{error}</Text> : null}
      <View style={{ gap: t.space[4] }}>
        {ORDER.map((id) => {
          const game = GAMES[id];
          const locked = game.requiresRoastOptIn && !prefs.roastOptIn;
          return (
            <Tactile
              key={id}
              testID={`game-${id}`}
              onPress={() => start(game)}
              accessibilityLabel={`${game.title}. ${game.description}${locked ? ' Needs roasts turned on.' : ''}`}
              squish={0.97}
              haptic="medium"
              style={{
                flexDirection: 'row',
                borderRadius: t.radius.card,
                overflow: 'hidden',
                backgroundColor: t.colors.surface,
                minHeight: 104,
              }}
            >
              <View
                style={{
                  width: 88,
                  backgroundColor: stub[id],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 36, lineHeight: 44 }}>{game.emoji}</Text>
              </View>
              {/* perforation between stub and body */}
              <View
                style={{
                  width: 2,
                  justifyContent: 'space-evenly',
                  backgroundColor: t.colors.surface,
                }}
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 2,
                      height: 6,
                      borderRadius: 1,
                      backgroundColor: t.colors.border,
                    }}
                  />
                ))}
              </View>
              <View style={{ flex: 1, padding: t.space[4], justifyContent: 'center', gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                  <Text variant="heading" style={{ flexShrink: 1 }}>
                    {game.title}
                  </Text>
                  {locked ? <Icon name="lock" size={18} color={t.colors.textMuted} /> : null}
                </View>
                <Text variant="callout" tone="muted">
                  {game.description}
                </Text>
                {game.maxRounds ? (
                  <Text variant="caption" tone="primary" weight="semibold">
                    {game.maxRounds} rounds
                  </Text>
                ) : null}
              </View>
            </Tactile>
          );
        })}
      </View>

      <Sheet visible={roastSheet} onClose={() => setRoastSheet(false)} title="Before the roast">
        <View style={{ gap: t.space[4] }}>
          <Text tone="muted">
            Roasts poke fun at habits and choices, never at who you are. Pick anything that’s
            off-limits and Bot-Friend will steer clear. Say “stop” at any point and it stops.
          </Text>
          <BoundaryPicker
            value={prefs.humorBoundaries}
            onChange={(humorBoundaries) => updatePrefs.mutate({ humorBoundaries })}
          />
          <Button
            label="Turn on roasts and play"
            testID="roast-confirm"
            loading={updatePrefs.isPending || create.isPending}
            onPress={async () => {
              await updatePrefs.mutateAsync({ roastOptIn: true });
              setRoastSheet(false);
              await start({ ...GAMES.roast_me, requiresRoastOptIn: false });
            }}
          />
          <Button label="Not today" variant="ghost" onPress={() => setRoastSheet(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
