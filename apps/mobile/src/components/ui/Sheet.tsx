import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

/** Bottom sheet built on Modal so focus and the back button behave natively. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={t.reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: t.colors.scrim,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.sheet,
            borderTopRightRadius: t.radius.sheet,
            paddingHorizontal: t.space[5],
            paddingTop: t.space[3],
            paddingBottom: Math.max(insets.bottom, t.space[5]),
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: t.colors.border,
              marginBottom: t.space[4],
            }}
          />
          <Text variant="heading" accessibilityRole="header" style={{ marginBottom: t.space[3] }}>
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
