import { MAX_MEMORY_LENGTH, type Memory } from '@bot-friend/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, TextInput, View } from 'react-native';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, Divider, IconButton, Screen, Section, Text, Toggle } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useMemories, useMemoryMutations, useUpdatePreferences } from '@/lib/api/hooks';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/theme';

function confirm(title: string, body: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}

export default function Memories() {
  const t = useTheme();
  const prefs = usePrefs((s) => s.prefs);
  const updatePrefs = useUpdatePreferences();
  const memories = useMemories();
  const m = useMemoryMutations();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = memories.data?.items ?? [];
  const suggested = items.filter((i) => i.status === 'suggested');
  const approved = items.filter((i) => i.status === 'approved');

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'That didn’t save. Try again.');
    }
  };

  const inputStyle = {
    flex: 1,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    borderRadius: t.radius.button,
    paddingHorizontal: t.space[4],
    paddingVertical: t.space[3],
    color: t.colors.text,
    backgroundColor: t.colors.surface,
    fontFamily: t.font.body,
    fontSize: t.type.body.fontSize * t.textScale,
  } as const;

  const row = (item: Memory) =>
    editing?.id === item.id ? (
      <View key={item.id} style={{ paddingVertical: t.space[3], gap: t.space[2] }}>
        <TextInput
          value={editing.content}
          onChangeText={(content) => setEditing({ ...editing, content })}
          maxLength={MAX_MEMORY_LENGTH}
          autoFocus
          accessibilityLabel="Edit memory"
          style={inputStyle}
        />
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <Button
            label="Save"
            onPress={() =>
              run(async () => {
                await m.edit.mutateAsync(editing);
                setEditing(null);
              })
            }
            disabled={editing.content.trim().length < 2}
          />
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} />
        </View>
      </View>
    ) : (
      <View
        key={item.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingVertical: t.space[2],
          minHeight: 52,
        }}
      >
        <Text style={{ flex: 1 }}>{item.content}</Text>
        {item.status === 'suggested' ? (
          <IconButton
            icon="check"
            label={`Remember: ${item.content}`}
            tone="soft"
            size={40}
            onPress={() => run(() => m.approve.mutateAsync(item.id))}
          />
        ) : (
          <IconButton
            icon="edit"
            label={`Edit: ${item.content}`}
            size={40}
            onPress={() => setEditing({ id: item.id, content: item.content })}
          />
        )}
        <IconButton
          icon="trash"
          label={`Forget: ${item.content}`}
          size={40}
          onPress={() => run(() => m.remove.mutateAsync(item.id))}
        />
      </View>
    );

  return (
    <Screen
      title="Memories"
      subtitle="Things Bot-Friend can bring up later. Only what you approve is used."
      headerRight={<IconButton icon="close" label="Close" onPress={() => router.back()} />}
    >
      <Section>
        <Toggle
          label="Let Bot-Friend remember things"
          description="When off, nothing here is used in your chats. Your list stays until you delete it."
          value={prefs.memoryEnabled}
          onChange={(memoryEnabled) => updatePrefs.mutate({ memoryEnabled })}
          testID="memory-toggle"
        />
      </Section>

      {error ? <Text tone="danger">{error}</Text> : null}
      {memories.isLoading ? <ActivityIndicator color={t.colors.primary} /> : null}
      {memories.isError ? (
        <Text tone="muted">Couldn’t load memories. Pull to refresh or try again later.</Text>
      ) : null}

      {suggested.length > 0 ? (
        <Section title="Want me to remember these?">
          {suggested.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider /> : null}
              {row(item)}
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Remembered">
        {approved.length === 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              paddingVertical: t.space[4],
            }}
          >
            <Mascot size={44} mood="thinking" color={prefs.mascotColor} />
            <Text tone="muted" style={{ flex: 1 }}>
              Nothing yet. Add something below, like your pet’s name or the jokes you can’t stand.
            </Text>
          </View>
        ) : (
          approved.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider /> : null}
              {row(item)}
            </View>
          ))
        )}
      </Section>

      <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. My cat is called Pickle"
          placeholderTextColor={t.colors.textMuted}
          maxLength={MAX_MEMORY_LENGTH}
          accessibilityLabel="New memory"
          style={inputStyle}
          testID="memory-input"
        />
        <Button
          label="Add"
          disabled={draft.trim().length < 2}
          loading={m.add.isPending}
          onPress={() =>
            run(async () => {
              await m.add.mutateAsync(draft.trim());
              setDraft('');
            })
          }
          testID="memory-add"
        />
      </View>

      {items.length > 0 ? (
        <Button
          label="Forget everything"
          variant="danger"
          onPress={() =>
            confirm(
              'Forget everything?',
              'This deletes every memory, including suggestions.',
              () => void run(() => m.eraseAll.mutateAsync()),
            )
          }
        />
      ) : null}
    </Screen>
  );
}
