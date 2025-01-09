import { GAMES, PERSONALITIES, type ComedyStyle } from '@bot-friend/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageMenu } from '@/components/chat/MessageMenu';
import { StylePicker } from '@/components/chat/StylePicker';
import { SuggestionRow } from '@/components/chat/SuggestionRow';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, ListRow, Sheet, Tactile, Text } from '@/components/ui';
import { useConversation, useDeleteConversation, useGameAction, useUpdatePreferences } from '@/lib/api/hooks';
import type { ChatItem } from '@/lib/chat/reducer';
import { useChatThread } from '@/lib/chat/useChatThread';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';

export default function ChatScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id, initial } = useLocalSearchParams<{ id: string; initial?: string }>();
  const detail = useConversation(id);
  const thread = useChatThread(id, detail.data);
  const prefs = usePrefs((s) => s.prefs);
  const updatePrefs = useUpdatePreferences();
  const deleteConvo = useDeleteConversation();
  const gameAction = useGameAction(id);
  const isGuest = useSession((s) => s.user?.isGuest ?? false);

  const [menuItem, setMenuItem] = useState<ChatItem | null>(null);
  const [stylePicker, setStylePicker] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // A message typed on the home screen is sent once the conversation has loaded.
  const sentInitial = useRef(false);
  useEffect(() => {
    if (initial && detail.data && !sentInitial.current) {
      sentInitial.current = true;
      thread.send(initial);
    }
  }, [initial, detail.data, thread]);

  const data = useMemo(() => [...thread.state.items].reverse(), [thread.state.items]);
  const userItemBefore = (key: string) => {
    const items = thread.state.items;
    const idx = items.findIndex((i) => i.key === key);
    for (let i = idx; i >= 0; i--) if (items[i]!.role === 'user') return items[i]!;
    return null;
  };

  const game = detail.data?.game;
  const gameInfo = detail.data && detail.data.mode !== 'chat' ? GAMES[detail.data.mode] : null;

  const pickStyle = (style: ComedyStyle) => updatePrefs.mutate({ comedyStyle: style });

  const confirmDelete = () => {
    const run = async () => {
      setMoreOpen(false);
      await deleteConvo.mutateAsync(id);
      router.back();
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Delete this chat? This can’t be undone.')) void run();
      return;
    }
    Alert.alert('Delete this chat?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  };

  if (detail.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background, padding: t.space[6], paddingTop: insets.top + t.space[6], gap: t.space[4] }}>
        <Mascot size={96} mood="surprised" />
        <Text variant="heading">This chat isn’t available</Text>
        <Text tone="muted">It may have been deleted. Head back and start a new one.</Text>
        <Button label="Back to chats" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      {/* header */}
      <View
        style={{
          paddingTop: insets.top + t.space[1],
          paddingHorizontal: t.space[2],
          paddingBottom: t.space[2],
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border,
          backgroundColor: t.colors.background,
        }}
      >
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Mascot size={44} mood={thread.mood} color={prefs.mascotColor} interactive testID="chat-mascot" />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" display weight="semibold" numberOfLines={1}>
            {detail.data?.title ?? ' '}
          </Text>
          <Tactile
            onPress={() => setStylePicker(true)}
            accessibilityLabel={`Comedy style: ${PERSONALITIES[prefs.comedyStyle].name}. Tap to change`}
            haptic="select"
            squish={0.97}
            style={{ alignSelf: 'flex-start' }}
          >
            <Text variant="caption" tone="primary" weight="semibold">
              {PERSONALITIES[prefs.comedyStyle].name} mode
            </Text>
          </Tactile>
        </View>
        <IconButton icon="more" label="Chat options" onPress={() => setMoreOpen(true)} testID="chat-more" />
      </View>

      {gameInfo && game ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[3],
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[2],
            backgroundColor: t.colors.accentWarmSoft,
          }}
        >
          <Text style={{ fontSize: 20 }}>{gameInfo.emoji}</Text>
          <Text variant="callout" weight="semibold" style={{ flex: 1 }}>
            {game.active
              ? game.maxRounds
                ? `${gameInfo.title}, round ${Math.min(game.round + 1, game.maxRounds)} of ${game.maxRounds}`
                : gameInfo.title
              : `${gameInfo.title} is over`}
          </Text>
          <Button
            label={game.active ? 'End game' : 'Play again'}
            variant="ghost"
            loading={gameAction.isPending}
            onPress={() => gameAction.mutate(game.active ? 'end' : 'restart', { onSuccess: () => detail.refetch() })}
          />
        </View>
      ) : null}

      {detail.isLoading ? (
        <ActivityIndicator color={t.colors.primary} style={{ marginTop: t.space[10] }} />
      ) : (
        <FlatList
          testID="message-list"
          inverted
          data={data}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingVertical: t.space[4] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={thread.hasOlder ? thread.loadOlder : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={thread.loadingOlder ? <ActivityIndicator color={t.colors.primary} /> : undefined}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }], alignItems: 'flex-start', gap: t.space[3], paddingTop: t.space[10] }}>
              <Text variant="heading">Say anything.</Text>
              <Text tone="muted">A bad day, a weird thought, a request for the worst pun you’ve ever heard. I’m listening.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              onLongPress={() => setMenuItem(item)}
              onRetry={() => {
                const user = item.role === 'user' ? item : userItemBefore(item.key);
                if (user) thread.retry(user);
              }}
            />
          )}
        />
      )}

      {thread.quota ? (
        <View style={{ marginHorizontal: t.space[4], marginBottom: t.space[2], padding: t.space[4], borderRadius: t.radius.card, backgroundColor: t.colors.primarySoft, gap: t.space[2] }}>
          <Text weight="semibold">{thread.quota.message}</Text>
          {thread.quota.guest && isGuest ? (
            <Button label="Create a free account" onPress={() => router.push('/(tabs)/profile')} />
          ) : null}
        </View>
      ) : null}

      <View style={{ paddingBottom: insets.bottom + t.space[2], paddingTop: t.space[2] }}>
        {!thread.streaming ? <SuggestionRow suggestions={thread.suggestions} onPick={(s) => thread.send(s)} /> : null}
        <View style={{ paddingHorizontal: t.space[3] }}>
          <Composer
            onSend={(text) => thread.send(text)}
            onStop={() => void thread.stop()}
            streaming={thread.streaming}
            disabled={!detail.data}
          />
        </View>
      </View>

      <MessageMenu item={menuItem} onClose={() => setMenuItem(null)} onReacted={(mid, reaction) => thread.dispatch({ type: 'react', id: mid, reaction })} />
      <StylePicker visible={stylePicker} value={prefs.comedyStyle} onPick={pickStyle} onClose={() => setStylePicker(false)} />
      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="Chat options">
        <ListRow icon="sparkle" label="Switch vibe" detail={PERSONALITIES[prefs.comedyStyle].name} onPress={() => { setMoreOpen(false); setStylePicker(true); }} />
        <ListRow icon="trash" label="Delete chat" tone="danger" onPress={confirmDelete} testID="chat-delete" />
      </Sheet>
    </KeyboardAvoidingView>
  );
}
