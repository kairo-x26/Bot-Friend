import { MAX_MESSAGE_LENGTH } from '@bot-friend/shared';
import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { IconButton, Text } from '@/components/ui';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { useTheme } from '@/theme/theme';

export interface ComposerProps {
  onSend(text: string, photo?: PickedPhoto): void;
  onStop?(): void;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Show the photo button (FEATURE_IMAGES). */
  allowPhotos?: boolean;
}

export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = 'Say something…',
  autoFocus,
  allowPhotos,
}: ComposerProps) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const canSend = (text.trim().length > 0 || !!photo) && !disabled;

  const submit = () => {
    if (!canSend || streaming) return;
    if (photo) onSend(text.trim() || 'Here’s a photo.', photo);
    else onSend(text.trim());
    setText('');
    setPhoto(null);
  };

  const attach = async () => {
    setPhotoError(null);
    try {
      const picked = await pickPhoto();
      if (picked) setPhoto(picked);
    } catch (err) {
      setPhotoError((err as Error).message);
    }
  };

  return (
    <View style={{ gap: t.space[2] }}>
      {photo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            paddingHorizontal: t.space[2],
          }}
        >
          <Image
            source={{ uri: photo.uri }}
            accessibilityLabel="Photo ready to send"
            style={{ width: 56, height: 56, borderRadius: 12 }}
          />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Photo attached. It’s checked for safety and isn’t saved.
          </Text>
          <IconButton icon="close" label="Remove photo" size={36} onPress={() => setPhoto(null)} />
        </View>
      ) : null}
      {photoError ? (
        <Text variant="caption" tone="danger" style={{ paddingHorizontal: t.space[2] }}>
          {photoError}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.space[2],
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.input,
          borderWidth: 1.5,
          borderColor: t.colors.border,
          paddingLeft: allowPhotos ? 6 : t.space[4],
          paddingRight: 6,
          paddingVertical: 6,
        }}
      >
        {allowPhotos ? (
          <IconButton
            icon="image"
            label="Add a photo"
            onPress={attach}
            disabled={disabled || streaming}
            testID="composer-photo"
          />
        ) : null}
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
    </View>
  );
}
