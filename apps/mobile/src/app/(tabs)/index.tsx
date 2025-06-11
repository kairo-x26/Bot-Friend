import type { Conversation } from '@bot-friend/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Composer } from '@/components/chat/Composer';
import { Mascot } from '@/components/mascot/Mascot';
import { Starfield } from '@/components/mascot/Starfield';
import { Chip, IconButton, Tactile, Text } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useConversations, useCreateConversation } from '@/lib/api/hooks';
import { greeting, STYLE_MOOD } from '@/lib/personality';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { relativeTime } from '@/lib/time';
import { useTheme } from '@/theme/theme';

const QUICK = [
  { label: '😂 Tell me a joke', message: 'Tell me a joke' },
  { label: '🎤 Joke battle', mode: 'joke_battle' as const },
  { label: '✨ Motivate me', message: 'I need a little motivation today' },
  { label: '🤔 Would you rather', mode: 'would_you_rather' as const },
  { label: '📖 Funny story', message: 'Tell me a funny story' },
];

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs((s) => s.prefs);
  const user = useSession((s) => s.user);
  const conversations = useConversations();
  const create = useCreateConversation();
  const [error, setError] = useState<string | null>(null);

  const items = conversations.data?.pages.flatMap((p) => p.items) ?? [];

  async function start(opts: { message?: string; mode?: Conversation['mode'] }) {
    setError(null);
    try {
      const convo = await create.mutateAsync({ mode: opts.mode ?? 'chat' });
      router.push({
        pathname: '/chat/[id]',
        params: { id: convo.id, ...(opts.message ? { initial: opts.message } : {}) },
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Couldn’t start a chat. Try again.');
    }
  }

  const header = (
    <View style={{ gap: t.space[5], paddingBottom: t.space[4] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[4],
          paddingTop: t.space[4],
        }}
      >
        <Mascot
          size={104}
          mood={STYLE_MOOD[prefs.comedyStyle]}
          color={prefs.mascotColor}
          interactive
          testID="home-mascot"
        />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text tone="muted" weight="medium" style={{ flex: 1 }}>
              {greeting()}
              {user?.displayName ? `, ${user.displayName}` : ''}
            </Text>
            {items.length > 0 ? (
              <IconButton
                icon="search"
                label="Search chats"
                size={40}
                onPress={() => router.push('/search')}
                testID="home-search"
              />
            ) : null}
          </View>
          <Text variant="title" accessibilityRole="header" style={{ marginTop: 2 }}>
            What are we getting into?
          </Text>
        </View>
      </View>

      <Composer
        onSend={(message) => start({ message })}
        disabled={create.isPending}
        placeholder="Tell me anything…"
      />
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: t.space[2], paddingRight: t.space[5] }}
        style={{ marginHorizontal: -t.space[5], paddingLeft: t.space[5] }}
      >
        {QUICK.map((q, i) => (
          <Chip
            key={q.label}
            label={q.label}
            tone={i % 2 ? 'calm' : 'warm'}
            onPress={() => start(q)}
          />
        ))}
      </ScrollView>

      <Text
        variant="subheading"
        display
        weight="semibold"
        accessibilityRole="header"
        style={{ marginTop: t.space[3] }}
      >
        Recent chats
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <Starfield height={220} />
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingHorizontal: t.space[5],
          paddingBottom: t.space[10],
        }}
        keyboardShouldPersistTaps="handled"
        onEndReached={() =>
          conversations.hasNextPage &&
          !conversations.isFetchingNextPage &&
          conversations.fetchNextPage()
        }
        onRefresh={() => conversations.refetch()}
        refreshing={conversations.isRefetching}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: t.colors.border, opacity: 0.6 }} />
        )}
        ListEmptyComponent={
          conversations.isLoading ? (
            <ActivityIndicator color={t.colors.primary} style={{ marginTop: t.space[6] }} />
          ) : conversations.isError ? (
            <Text tone="muted">Couldn’t load your chats. Pull down to try again.</Text>
          ) : (
            <Text tone="muted">No chats yet. Say hi up there and I’ll take it from here.</Text>
          )
        }
        ListFooterComponent={
          conversations.isFetchingNextPage ? (
            <ActivityIndicator color={t.colors.primary} style={{ marginTop: t.space[4] }} />
          ) : undefined
        }
        renderItem={({ item }) => <ConversationRow convo={item} />}
      />
    </KeyboardAvoidingView>
  );
}

const MODE_EMOJI: Record<Conversation['mode'], string> = {
  chat: '💬',
  joke_battle: '🎤',
  roast_me: '🔥',
  would_you_rather: '🤔',
  story_builder: '📖',
  silly_quiz: '🧠',
};

function ConversationRow({ convo }: { convo: Conversation }) {
  const t = useTheme();
  return (
    <Tactile
      testID={`conversation-${convo.id}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: convo.id } })}
      accessibilityLabel={`${convo.title}. ${convo.lastMessagePreview ?? ''}`}
      squish={0.99}
      haptic={false}
      style={{
        flexDirection: 'row',
        gap: t.space[3],
        paddingVertical: t.space[3],
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: t.colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="subheading">{MODE_EMOJI[convo.mode]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space[2] }}>
          <Text weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
            {convo.title}
          </Text>
          <Text variant="caption" tone="muted">
            {relativeTime(convo.updatedAt)}
          </Text>
        </View>
        {convo.lastMessagePreview ? (
          <Text variant="callout" tone="muted" numberOfLines={1}>
            {convo.lastMessagePreview}
          </Text>
        ) : null}
      </View>
    </Tactile>
  );
}
