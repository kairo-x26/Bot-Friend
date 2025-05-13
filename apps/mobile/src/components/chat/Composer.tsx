import { MAX_MESSAGE_LENGTH } from '@bot-friend/shared';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { IconButton } from '@/components/ui';
import { useTheme } from '@/theme/theme';

export interface ComposerProps {
  onSend(text: string): void;
  onStop?(): void;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = 'Say something…',
  autoFocus,
}: ComposerProps) {
  const t = useTheme();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend || streaming) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: t.space[2],
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.input,
        borderWidth: 1.5,
        borderColor: t.colors.border,
        paddingLeft: t.space[4],
        paddingRight: 6,
        paddingVertical: 6,
      }}
    >
      <TextInput
        testID="composer-input"
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textMuted}
        multiline
        numberOfLines={1}
        maxLength={MAX_MESSAGE_LENGTH}
        autoFocus={autoFocus}
        editable={!disabled}
        accessibilityLabel="Message"
        submitBehavior="submit"
        onSubmitEditing={submit}
        style={{
          flex: 1,
          minHeight: 36,
          maxHeight: 132,
          paddingTop: 8,
          paddingBottom: 8,
          color: t.colors.text,
          fontFamily: t.font.body,
          fontSize: t.type.body.fontSize * t.textScale,
          lineHeight: t.type.body.lineHeight * t.textScale,
          outlineStyle: 'none' as never,
        }}
      />
      {streaming ? (
        <IconButton
          icon="stop"
          label="Stop reply"
          tone="soft"
          onPress={onStop}
          testID="composer-stop"
        />
      ) : (
        <IconButton
          icon="send"
          label="Send message"
          tone="primary"
          onPress={submit}
          disabled={!canSend}
          testID="composer-send"
        />
      )}
    </View>
  );
}
