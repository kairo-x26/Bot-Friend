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

  it('attaches a downscaled photo and sends it with a default caption', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer onSend={onSend} allowPhotos />);
    await fireEvent.press(screen.getByTestId('composer-photo'));
    expect(await screen.findByLabelText('Photo ready to send')).toBeTruthy();
    const manip = jest.requireMock('expo-image-manipulator') as { __ctx: { resize: jest.Mock } };
    expect(manip.__ctx.resize).toHaveBeenCalledWith({ width: 1024 });
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('Here’s a photo.', {
      uri: 'file:///small.jpg',
      mediaType: 'image/jpeg',
      data: 'QUJD',
    });
  });

  it('hides the photo button unless photos are enabled', async () => {
    await renderWithTheme(<Composer onSend={jest.fn()} />);
    expect(screen.queryByTestId('composer-photo')).toBeNull();
  });
});
