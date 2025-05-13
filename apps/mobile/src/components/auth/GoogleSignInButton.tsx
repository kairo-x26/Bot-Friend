import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Button } from '@/components/ui';
import { config } from '@/lib/config';

WebBrowser.maybeCompleteAuthSession();

export const googleEnabled = Boolean(
  config.google.ios || config.google.android || config.google.web,
);

/** Google sign-in via OAuth; only rendered when client ids are configured. */
export function GoogleSignInButton({
  busy,
  onToken,
  onError,
}: {
  busy: boolean;
  onToken: (idToken: string) => void;
  onError: () => void;
}) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    iosClientId: config.google.ios || undefined,
    androidClientId: config.google.android || undefined,
    webClientId: config.google.web || undefined,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success' && response.params.id_token) onToken(response.params.id_token);
    else if (response.type === 'error') onError();
  }, [response, onToken, onError]);

  return (
    <Button
      label="Continue with Google"
      variant="secondary"
      size="lg"
      loading={busy}
      disabled={!request}
      onPress={() => void prompt()}
    />
  );
}
