import type { SearchHit } from '@bot-friend/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Tactile, Text } from '@/components/ui';
import { useSearch } from '@/lib/api/hooks';
import { relativeTime } from '@/lib/time';
import { useTheme } from '@/theme/theme';

/** Renders "[match]" markers from the API as highlighted text. */
function Snippet({ text }: { text: string }) {
  const t = useTheme();
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <Text variant="callout" tone="muted" numberOfLines={2}>
      {parts.map((p, i) =>
        p.startsWith('[') && p.endsWith(']') ? (
          <Text
            key={i}
            variant="callout"
            weight="bold"
            style={{ color: t.colors.text, backgroundColor: t.colors.accentWarmSoft }}
          >
            {p.slice(1, -1)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export default function Search() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  const search = useSearch(debounced);
  const items = search.data?.items ?? [];

  return (
    <View
      style={{ flex: 1, backgroundColor: t.colors.background, paddingTop: insets.top + t.space[2] }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          paddingBottom: t.space[3],
        }}
      >
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.input,
            borderWidth: 1.5,
            borderColor: t.colors.border,
            paddingHorizontal: t.space[4],
          }}
        >
          <Icon name="search" size={20} color={t.colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search your chats"
            placeholderTextColor={t.colors.textMuted}
            returnKeyType="search"
            accessibilityLabel="Search your chats"
            testID="search-input"
            style={{
              flex: 1,
              minHeight: 46,
              color: t.colors.text,
              fontFamily: t.font.body,
              fontSize: 16,
              outlineStyle: 'none' as never,
            }}
          />
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(h) => h.messageId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: t.space[5],
          paddingBottom: insets.bottom + t.space[8],
        }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: t.colors.border, opacity: 0.6 }} />
        )}
        ListHeaderComponent={
          search.isFetching ? (
            <ActivityIndicator color={t.colors.primary} style={{ marginVertical: t.space[3] }} />
          ) : undefined
        }
        ListEmptyComponent={
          debounced.trim().length < 2 ? (
            <Text tone="muted">
              Type at least two letters to search everything you and Bot-Friend have said.
            </Text>
          ) : search.isSuccess ? (
            <Text tone="muted">No matches for “{debounced.trim()}”.</Text>
          ) : search.isError ? (
            <Text tone="danger">Search didn’t work just now. Try again.</Text>
          ) : undefined
        }
        renderItem={({ item }: { item: SearchHit }) => (
          <Tactile
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: item.conversationId } })
            }
            accessibilityLabel={`${item.conversationTitle}: ${item.snippet.replace(/[[\]]/g, '')}`}
            squish={0.99}
            haptic={false}
            style={{ paddingVertical: t.space[3], gap: 2 }}
          >
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Text weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                {item.conversationTitle}
              </Text>
              <Text variant="caption" tone="muted">
                {item.role === 'user' ? 'You' : 'Bot-Friend'}, {relativeTime(item.createdAt)}
              </Text>
            </View>
            <Snippet text={item.snippet} />
          </Tactile>
        )}
      />
    </View>
  );
}
