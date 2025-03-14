import type {
  AccountDeletionResponse,
  FeatureFlags,
  Memory,
  MemoryList,
  SearchResult,
  SubscriptionStatus,
  VerifyPurchase,
  VoiceSession,
  Conversation,
  ConversationDetail,
  ConversationPage,
  CreateConversation,
  CreateReport,
  CreateSessionRequest,
  GameInfo,
  MeResponse,
  MessagePage,
  Preferences,
  Reaction,
  Report,
  SessionResponse,
  UsageResponse,
} from '@bot-friend/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { usePrefs } from '../prefs';
import { useSession } from '../session';
import { api } from './client';

export const qk = {
  me: ['me'] as const,
  usage: ['usage'] as const,
  games: ['games'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  features: ['features'] as const,
  memories: ['memories'] as const,
  search: (q: string) => ['search', q] as const,
  subscription: ['subscription'] as const,
};

export function createSession(req: CreateSessionRequest) {
  return api<SessionResponse>('POST', '/v1/auth/session', req, { auth: false });
}

export function useMe() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const hydrate = usePrefs((s) => s.hydrate);
  return useQuery({
    queryKey: qk.me,
    enabled: signedIn,
    queryFn: async () => {
      const me = await api<MeResponse>('GET', '/v1/me');
      hydrate(me.preferences);
      return me;
    },
  });
}

/** Optimistic preference updates: the UI (theme, motion) reacts immediately. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  const patchLocal = usePrefs((s) => s.patch);
  const hydrate = usePrefs((s) => s.hydrate);
  return useMutation({
    mutationFn: (patch: Partial<Preferences>) => api<Preferences>('PATCH', '/v1/me/preferences', patch),
    onMutate: (patch) => {
      const previous = usePrefs.getState().prefs;
      patchLocal(patch);
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) hydrate(ctx.previous);
    },
    onSuccess: (prefs) => {
      hydrate(prefs);
      qc.setQueryData<MeResponse>(qk.me, (me) => (me ? { ...me, preferences: prefs } : me));
    },
  });
}

export function useConversations() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useInfiniteQuery({
    queryKey: qk.conversations,
    enabled: signedIn,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<ConversationPage>('GET', `/v1/conversations?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => api<ConversationDetail>('GET', `/v1/conversations/${id}`),
  });
}

export function fetchOlderMessages(id: string, cursor: string) {
  return api<MessagePage>('GET', `/v1/conversations/${id}/messages?limit=30&cursor=${encodeURIComponent(cursor)}`);
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConversation) => api<Conversation>('POST', '/v1/conversations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/v1/conversations/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: qk.conversation(id) });
      return qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useGameAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'end' | 'restart') => api<Conversation>('POST', `/v1/conversations/${id}/game`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversation(id) }),
  });
}

export function useGames() {
  return useQuery({
    queryKey: qk.games,
    queryFn: () => api<{ items: GameInfo[] }>('GET', '/v1/games', undefined, { auth: false }),
    staleTime: Infinity,
  });
}

export function useUsage() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({ queryKey: qk.usage, enabled: signedIn, queryFn: () => api<UsageResponse>('GET', '/v1/usage') });
}

export function useReport() {
  return useMutation({ mutationFn: (body: CreateReport) => api<Report>('POST', '/v1/reports', body) });
}

export function useReact() {
  return useMutation({
    mutationFn: ({ messageId, reaction }: { messageId: string; reaction: Reaction | null }) =>
      api<{ reaction: Reaction | null }>('POST', `/v1/messages/${messageId}/reaction`, { reaction }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api<AccountDeletionResponse>('POST', '/v1/account/deletion', { confirm: 'DELETE' }),
  });
}

/** A finished reply can change the title, preview, game round and usage; refresh those. */
export function touchConversation(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: qk.conversations });
  void qc.invalidateQueries({ queryKey: qk.usage });
  void qc.invalidateQueries({ queryKey: qk.conversation(id) });
}

export function useFeatures() {
  return useQuery({
    queryKey: qk.features,
    queryFn: () => api<FeatureFlags>('GET', '/v1/features', undefined, { auth: false }),
    staleTime: 5 * 60_000,
  });
}

export function useMemories() {
  return useQuery({ queryKey: qk.memories, queryFn: () => api<MemoryList>('GET', '/v1/memories') });
}

export function useMemoryMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: qk.memories });
  return {
    add: useMutation({ mutationFn: (content: string) => api<Memory>('POST', '/v1/memories', { content }), onSuccess: done }),
    approve: useMutation({ mutationFn: (id: string) => api<Memory>('PATCH', `/v1/memories/${id}`, { status: 'approved' }), onSuccess: done }),
    edit: useMutation({
      mutationFn: ({ id, content }: { id: string; content: string }) => api<Memory>('PATCH', `/v1/memories/${id}`, { content }),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api<void>('DELETE', `/v1/memories/${id}`), onSuccess: done }),
    eraseAll: useMutation({ mutationFn: () => api<{ deleted: number }>('DELETE', '/v1/memories'), onSuccess: done }),
  };
}

export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(term),
    enabled: term.length >= 2,
    queryFn: () => api<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(term)}`),
    placeholderData: (prev) => prev,
  });
}

export function useSubscription() {
  return useQuery({ queryKey: qk.subscription, queryFn: () => api<SubscriptionStatus>('GET', '/v1/billing/subscription') });
}

export function useVerifyPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyPurchase) => api<SubscriptionStatus>('POST', '/v1/billing/verify', body),
    onSuccess: (data) => {
      qc.setQueryData(qk.subscription, data);
      void qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export function createVoiceSession() {
  return api<VoiceSession>('POST', '/v1/voice/session');
}
