import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, Text } from '@/components/ui';
import { Waveform } from '@/components/voice/Waveform';
import { ApiClientError } from '@/lib/api/client';
import { createVoiceSession } from '@/lib/api/hooks';
import type { MascotMood } from '@/lib/chat/reducer';
import { usePrefs } from '@/lib/prefs';
import { transportFor, type VoiceState, type VoiceTransport } from '@/lib/voice/transport';
import { ThemeProvider, useTheme } from '@/theme/theme';

const LABEL: Record<VoiceState, string> = {
  connecting: 'Connecting…',
  listening: 'I’m listening',
  userSpeaking: 'Go on…',
  botSpeaking: 'Talking',
  ended: 'Call ended',
  error: 'The connection dropped',
};
const MOOD: Record<VoiceState, MascotMood> = {
  connecting: 'thinking',
  listening: 'idle',
  userSpeaking: 'happy',
  botSpeaking: 'laughing',
  ended: 'sleepy',
  error: 'surprised',
};

/** The call screen is always dark, like a phone call, whatever the app theme is. */
export default function VoiceScreen() {
  const prefs = usePrefs((s) => s.prefs);
  return (
    <ThemeProvider
      settings={{ theme: 'dark', reducedMotion: prefs.reducedMotion, largeText: prefs.largeText }}
    >
      <Voice />
    </ThemeProvider>
  );
}

function Voice() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const color = usePrefs((s) => s.prefs.mascotColor);
  const [state, setState] = useState<VoiceState>('connecting');
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const transport = useRef<VoiceTransport | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await createVoiceSession();
        const tr = transportFor(session.clientSecret);
        if (!tr) {
          setProblem('Voice chat needs the full Bot-Friend app build. Text chat works everywhere.');
          setState('error');
          return;
        }
        if (cancelled) return;
        transport.current = tr;
        await tr.start((s) => !cancelled && setState(s));
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiClientError
            ? err.message
            : (err as Error).name === 'NotAllowedError'
              ? 'Microphone access is off. Allow it in your settings to talk.'
              : 'Couldn’t start voice chat. Try again.';
        setProblem(message);
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
      transport.current?.stop();
    };
  }, []);

  const end = () => {
    transport.current?.stop();
    setState('ended');
    router.back();
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.background,
        paddingTop: insets.top + t.space[2],
        paddingBottom: insets.bottom + t.space[6],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: t.space[4],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          {state !== 'error' && state !== 'ended' ? (
            <View
              accessible
              accessibilityLabel={muted ? 'Microphone muted' : 'Microphone on'}
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: muted ? t.colors.textMuted : '#FF6B6B',
              }}
            />
          ) : null}
          <Text variant="caption" tone="muted">
            {muted ? 'Mic muted' : state === 'error' || state === 'ended' ? '' : 'Mic on'}
          </Text>
        </View>
        <IconButton icon="close" label="End voice chat" onPress={end} />
      </View>

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[6],
          paddingHorizontal: t.space[6],
        }}
      >
        <Mascot size={160} mood={MOOD[state]} color={color} />
        <Waveform state={state} />
        <Text variant="title" align="center" accessibilityLiveRegion="polite">
          {LABEL[state]}
        </Text>
        {problem ? (
          <Text align="center" tone="muted">
            {problem}
          </Text>
        ) : (
          <Text variant="caption" align="center" tone="muted">
            You’re talking with an AI. Interrupt any time.
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.space[6] }}>
        <IconButton
          icon="mic"
          label={muted ? 'Unmute microphone' : 'Mute microphone'}
          tone={muted ? 'soft' : 'plain'}
          size={64}
          disabled={state === 'error' || state === 'connecting'}
          onPress={() => {
            transport.current?.setMuted(!muted);
            setMuted(!muted);
          }}
          testID="voice-mute"
        />
        <View style={{ width: 160 }}>
          <Button label="End call" variant="danger" size="lg" onPress={end} testID="voice-end" />
        </View>
      </View>
    </View>
  );
}
