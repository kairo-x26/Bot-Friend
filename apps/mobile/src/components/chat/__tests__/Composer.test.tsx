import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/render';
import { Composer } from '../Composer';

describe('Composer', () => {
  it('does not send empty or whitespace-only messages', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer onSend={onSend} />);
    await fireEvent.press(screen.getByTestId('composer-send'));
    await fireEvent.changeText(screen.getByTestId('composer-input'), '    ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends trimmed text and clears the input', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer onSend={onSend} />);
    await fireEvent.changeText(screen.getByTestId('composer-input'), '  tell me a joke  ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('tell me a joke');
    expect(screen.getByTestId('composer-input').props.value).toBe('');
  });

  it('swaps send for a stop button while streaming', async () => {
    const onStop = jest.fn();
    await renderWithTheme(<Composer onSend={jest.fn()} onStop={onStop} streaming />);
    expect(screen.queryByTestId('composer-send')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Stop reply'));
    expect(onStop).toHaveBeenCalled();
  });
});
