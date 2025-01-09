import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThinkingDots } from '@/components/mascot/ThinkingDots';
import { Button, Tactile, Text } from '@/components/ui';
import type { ChatItem } from '@/lib/chat/reducer';
import { useTheme } from '@/theme/theme';
import { SupportCard } from './SupportCard';

const REACTION_EMOJI = { laugh: '😂', love: '❤️', meh: '😐', up: '👍', down: '👎' } as const;

interface Props {
  item: ChatItem;
  /** The user message this reply answers, for retrying a failed reply. */
  onRetry?: () => void;
  onLongPress?: () => void;
}

export const MessageBubble = memo(function MessageBubble({ item, onRetry, onLongPress }: Props) {
  const t = useTheme();
  const mine = item.role === 'user';
  const entering = t.reducedMotion ? undefined : FadeInDown.duration(t.motion.base).springify().damping(18);

  if (!mine && item.status === 'blocked' && item.supportResources) {
    return (
      <Animated.View entering={entering} style={{ marginVertical: t.space[1] }}>
        <SupportCard text={item.content} />
      </Animated.View>
    );
  }

  const streaming = item.status === 'streaming';
  const failed = item.status === 'failed';
  const unsent = item.status === 'unsent';
  const cancelled = item.status === 'cancelled';
  const muted = (!mine && item.status === 'blocked') || cancelled;

  const bubble = (
    <View
      style={{
        maxWidth: '84%',
        alignSelf: mine ? 'flex-end' : 'flex-start',
        backgroundColor: mine ? t.colors.userBubble : t.colors.botBubble,
        borderRadius: t.radius.bubble,
        [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: t.radius.bubbleTail,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3] - 2,
        borderWidth: mine ? 0 : 1,
        borderColor: t.colors.border,
        opacity: item.status === 'sending' ? 0.75 : 1,
        borderStyle: muted ? 'dashed' : 'solid',
      }}
    >
      {streaming && !item.content ? (
        <ThinkingDots />
      ) : (
        <Text
          selectable
          tone={muted ? 'muted' : 'default'}
          style={{ color: mine ? t.colors.userBubbleText : muted ? t.colors.textMuted : t.colors.botBubbleText }}
        >
          {item.content}
          {streaming ? <Text style={{ color: t.colors.primaryText }}> ▍</Text> : null}
        </Text>
      )}
    </View>
  );

  return (
    <Animated.View entering={mine ? undefined : entering} style={{ marginVertical: 3, gap: 4 }}>
      {!mine && item.id && !streaming ? (
        <Tactile
          onLongPress={onLongPress}
          delayLongPress={300}
          accessibilityRole="text"
          accessibilityLabel={`Bot-Friend said: ${item.content}`}
          accessibilityHint="Long press for reactions and reporting"
          accessibilityActions={[{ name: 'longpress', label: 'React or report' }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress?.()}
          squish={0.985}
          haptic={false}
        >
          {bubble}
        </Tactile>
      ) : (
        bubble
      )}

      {item.reaction ? (
        <Text
          accessibilityLabel={`You reacted ${item.reaction}`}
          style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -10, marginLeft: mine ? 0 : t.space[3], fontSize: 16 }}
        >
          {REACTION_EMOJI[item.reaction]}
        </Text>
      ) : null}

      {cancelled ? (
        <Text variant="caption" tone="muted" style={{ marginLeft: t.space[2] }}>
          Stopped
        </Text>
      ) : null}

      {(failed || unsent) && (
        <View
          accessibilityLiveRegion="polite"
          style={{ alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: 'row', alignItems: 'center', gap: t.space[2], maxWidth: '84%' }}
        >
          <Text variant="caption" tone="danger" style={{ flexShrink: 1 }}>
            {item.error ?? 'Not sent.'}
          </Text>
          {item.retryable !== false && onRetry ? <Button label="Retry" variant="ghost" onPress={onRetry} testID={`retry-${item.key}`} /> : null}
        </View>
      )}
    </Animated.View>
  );
});
