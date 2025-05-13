import { fireEvent, screen } from '@testing-library/react-native';
import type { ChatItem } from '@/lib/chat/reducer';
import { renderWithTheme } from '@/test/render';
import { MessageBubble } from '../MessageBubble';

const base: ChatItem = {
  key: 'k1',
  id: 'id-1',
  role: 'assistant',
  content: 'Hello there',
  status: 'completed',
  suggestions: [],
  reaction: null,
  createdAt: '2025-01-01T00:00:00Z',
};

describe('MessageBubble', () => {
  it('shows a typing indicator before the first words arrive', async () => {
    await renderWithTheme(<MessageBubble item={{ ...base, content: '', status: 'streaming' }} />);
    expect(screen.getByLabelText('Bot-Friend is typing')).toBeTruthy();
  });

  it('offers retry on a failed reply', async () => {
    const onRetry = jest.fn();
    await renderWithTheme(
      <MessageBubble
        item={{ ...base, status: 'failed', error: 'Bot-Friend couldn’t answer', retryable: true }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Bot-Friend couldn’t answer')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('labels stopped replies', async () => {
    await renderWithTheme(<MessageBubble item={{ ...base, status: 'cancelled' }} />);
    expect(screen.getByText('Stopped')).toBeTruthy();
  });

  it('renders the support card with crisis options for safety replies', async () => {
    await renderWithTheme(
      <MessageBubble
        item={{
          ...base,
          status: 'blocked',
          supportResources: true,
          content: 'You deserve support.',
        }}
      />,
    );
    expect(screen.getByText('You’re not alone')).toBeTruthy();
    expect(screen.getByLabelText('Call 988')).toBeTruthy();
  });

  it('exposes long-press actions to screen readers', async () => {
    const onLongPress = jest.fn();
    await renderWithTheme(<MessageBubble item={base} onLongPress={onLongPress} />);
    const bubble = screen.getByLabelText('Bot-Friend said: Hello there');
    await fireEvent(bubble, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(onLongPress).toHaveBeenCalled();
  });
});
