import { reportCategorySchema, type Reaction, type ReportCategory } from '@bot-friend/shared';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { Button, Divider, ListRow, Sheet, Tactile, Text } from '@/components/ui';
import { ApiClientError } from '@/lib/api/client';
import { useReact, useReport } from '@/lib/api/hooks';
import type { ChatItem } from '@/lib/chat/reducer';
import { useTheme } from '@/theme/theme';

const REACTIONS: Array<{ value: Reaction; emoji: string; label: string }> = [
  { value: 'laugh', emoji: '😂', label: 'Funny' },
  { value: 'love', emoji: '❤️', label: 'Love it' },
  { value: 'up', emoji: '👍', label: 'Good reply' },
  { value: 'meh', emoji: '😐', label: 'Meh' },
  { value: 'down', emoji: '👎', label: 'Bad reply' },
];

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  offensive: 'Offensive or hurtful',
  harassment: 'Harassing or mean',
  sexual: 'Sexual content',
  self_harm: 'Encourages self-harm',
  misinformation: 'False or misleading',
  not_funny: 'Just not funny',
  other: 'Something else',
};

export function MessageMenu({
  item,
  onClose,
  onReacted,
}: {
  item: ChatItem | null;
  onClose: () => void;
  onReacted: (id: string, reaction: Reaction | null) => void;
}) {
  const t = useTheme();
  const react = useReact();
  const report = useReport();
  const [mode, setMode] = useState<'menu' | 'report' | 'done'>('menu');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode('menu');
    setCategory(null);
    setNote('');
    setError(null);
    onClose();
  };

  if (!item?.id) return null;
  const id = item.id;

  return (
    <Sheet
      visible
      onClose={close}
      title={
        mode === 'report' ? 'Report this reply' : mode === 'done' ? 'Report sent' : 'This reply'
      }
    >
      {mode === 'menu' && (
        <View style={{ gap: t.space[3] }}>
          <View
            accessibilityRole="toolbar"
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            {REACTIONS.map((r) => {
              const active = item.reaction === r.value;
              return (
                <Tactile
                  key={r.value}
                  accessibilityLabel={r.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    const next = active ? null : r.value;
                    onReacted(id, next);
                    react.mutate({ messageId: id, reaction: next });
                    close();
                  }}
                  squish={0.85}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? t.colors.primarySoft : t.colors.backgroundAlt,
                  }}
                >
                  <Text style={{ fontSize: 24, lineHeight: 30 }}>{r.emoji}</Text>
                </Tactile>
              );
            })}
          </View>
          <Divider />
          <ListRow
            icon="heart"
            label="Share"
            detail="Send this one to a friend"
            onPress={() => {
              close();
              // User-initiated share of a single reply (BF-030); nothing else from the chat is included.
              void Share.share({ message: `${item.content}\n\n— Bot-Friend` }).catch(
                () => undefined,
              );
            }}
            testID="menu-share"
          />
          <ListRow
            icon="check"
            label="Copy text"
            onPress={() => void Clipboard.setStringAsync(item.content).then(close)}
          />
          <ListRow
            icon="flag"
            label="Report"
            detail="Tell us if this reply was harmful or wrong"
            tone="danger"
            onPress={() => setMode('report')}
            testID="menu-report"
          />
        </View>
      )}

      {mode === 'report' && (
        <View style={{ gap: t.space[2] }}>
          <View accessibilityRole="radiogroup">
            {reportCategorySchema.options.map((c) => (
              <ListRow
                key={c}
                label={CATEGORY_LABEL[c]}
                onPress={() => setCategory(c)}
                testID={`report-${c}`}
                trailing={
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: category === c ? t.colors.primary : t.colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {category === c ? (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: t.colors.primary,
                        }}
                      />
                    ) : null}
                  </View>
                }
              />
            ))}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything else? (optional)"
            placeholderTextColor={t.colors.textMuted}
            maxLength={1000}
            multiline
            accessibilityLabel="Report details"
            style={{
              minHeight: 64,
              borderWidth: 1.5,
              borderColor: t.colors.border,
              borderRadius: t.radius.button,
              padding: t.space[3],
              color: t.colors.text,
              fontFamily: t.font.body,
            }}
          />
          {error ? <Text tone="danger">{error}</Text> : null}
          <Button
            label="Send report"
            disabled={!category}
            loading={report.isPending}
            testID="report-submit"
            onPress={async () => {
              if (!category) return;
              setError(null);
              try {
                await report.mutateAsync({
                  messageId: id,
                  category,
                  note: note.trim() || undefined,
                });
                setMode('done');
              } catch (err) {
                setError(
                  err instanceof ApiClientError ? err.message : 'Report didn’t send. Try again.',
                );
              }
            }}
          />
        </View>
      )}

      {mode === 'done' && (
        <View style={{ gap: t.space[4] }}>
          <Text tone="muted">
            Thanks. A person on our team will review it. This helps make Bot-Friend better for
            everyone.
          </Text>
          <Button label="Done" onPress={close} />
        </View>
      )}
    </Sheet>
  );
}
