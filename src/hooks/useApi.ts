import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

/* Health */
export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: api.fetchHealth,
    refetchInterval: 30000,
  });

/* Dashboard */
export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: api.fetchDashboard,
  });

/* Sources */
export const useYouTubeSources = () =>
  useQuery({
    queryKey: ['sources', 'youtube'],
    queryFn: api.fetchYouTubeSources,
  });

export const useNoteSources = () =>
  useQuery({
    queryKey: ['sources', 'notes'],
    queryFn: api.fetchNoteSources,
  });

export const usePdfSources = () =>
  useQuery({
    queryKey: ['sources', 'pdf'],
    queryFn: api.fetchPdfSources,
  });

export const useUploadPdf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadPdf(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources', 'pdf'] }),
  });
};

export const useIngestYouTube = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.ingestYouTube(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources', 'youtube'] }),
  });
};

export const useUploadNotes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadNotes(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources', 'notes'] }),
  });
};

export const useSyncNotes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.syncNotes(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources', 'notes'] }),
  });
};

export const useDeleteSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources'] });
    },
  });
};

export const useReindexSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reindexSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
};

export const useSummarizeSource = () =>
  useMutation({
    mutationFn: (id: string) => api.summarizeSource(id),
  });

/* Chat */
export const useChatSessions = () =>
  useQuery({
    queryKey: ['chat', 'sessions'],
    queryFn: api.fetchChatSessions,
  });

export const useCreateChatSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.createChatSession(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'sessions'] }),
  });
};

export const useChatMessages = (sessionId: string | null) =>
  useQuery({
    queryKey: ['chat', 'messages', sessionId],
    queryFn: () => api.fetchChatMessages(sessionId!),
    enabled: !!sessionId,
  });

export const useSendMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, message, mode, strictSources, sourceIds }: {
      sessionId: string;
      message: string;
      mode: string;
      strictSources?: boolean;
      sourceIds?: string[];
    }) => api.sendChatMessage(sessionId, message, mode, strictSources ?? false, sourceIds),
    onSuccess: (_, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ['chat', 'messages', sessionId] });
      qc.invalidateQueries({ queryKey: ['chat', 'sessions'] });
    },
    // Even on failure, the server persists a fallback assistant message so
    // the thread stays coherent — refetch so the user sees it.
    onError: (_err, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ['chat', 'messages', sessionId] });
    },
  });
};

/* Insights */
export const useInsights = () =>
  useQuery({
    queryKey: ['insights'],
    queryFn: api.fetchInsights,
  });

/* Admin */
export const useAdminUsers = () =>
  useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.fetchAdminUsers,
  });

export const useApiKeys = () =>
  useQuery({
    queryKey: ['admin', 'apikeys'],
    queryFn: api.fetchApiKeys,
  });
