import { apiClient } from './axios';
import {
  type YouTubeSource, type NoteSource, type PdfSource, type ChatSession, type ChatMessage,
  type AdminUser, type ApiKey, type DashboardKPI, type ActivityItem,
} from './mock-data';

export interface DashboardData {
  kpis: DashboardKPI[];
  activity: ActivityItem[];
  usageTrend: { date: string; queries: number; latency: number }[];
}

export interface InsightsQueryDay { date: string; count: number }
export interface InsightsAuditEntry { id: string; action: string; user: string; details: string; timestamp: string }
export interface InsightsData {
  queriesPerDay: InsightsQueryDay[];
  avgLatency: number;
  costEstimate: string;
  noAnswerRate: number;
  retrievalQuality: number;
  thumbsUp: number;
  thumbsDown: number;
  auditLog: InsightsAuditEntry[];
}

/* ===== Health ===== */
export const fetchHealth = async (): Promise<{ status: 'healthy' | 'degraded' | 'down' }> => {
  const { data } = await apiClient.get('/health');
  // Map backend services status to overall status
  if (data.services.python !== 'ok' && data.services.python !== 'ok (assumed)') return { status: 'degraded' };
  return { status: 'healthy' };
};

/* ===== Dashboard ===== */
export const fetchDashboard = async (): Promise<DashboardData> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/analytics/dashboard?workspaceId=${workspaceId}`);
  return data;
};

/* ===== Sources ===== */
export const fetchYouTubeSources = async (): Promise<YouTubeSource[]> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/sources?workspaceId=${workspaceId}`);
  // Map backend Source to YouTubeSource
  return data.filter((s: any) => s.type === 'YOUTUBE').map((s: any) => {
    const isReady = s.status === 'READY';
    return {
      id: s.id,
      title: s.title,
      url: s.youtubeVideo?.videoUrl || s.title,
      addedAt: s.createdAt.split('T')[0],
      status: s.status.toLowerCase(),
      pipeline: {
        loaded: true,
        chunked: isReady,
        embedded: isReady,
        indexed: isReady,
      },
      errorReason: s.errorReason ?? undefined,
      errorCode: s.errorCode ?? undefined,
    };
  });
};

export const fetchPdfSources = async (): Promise<PdfSource[]> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/sources?workspaceId=${workspaceId}`);
  return data.filter((s: any) => s.type === 'PDF').map((s: any) => ({
    id: s.id,
    title: s.title,
    filename: s.pdfDocument?.filename || s.title,
    pageCount: s.pdfDocument?.pageCount ?? undefined,
    addedAt: (s.createdAt || '').split('T')[0],
    status: (s.status || 'INDEXING').toLowerCase(),
    errorReason: s.errorReason ?? undefined,
    errorCode: s.errorCode ?? undefined,
  }));
};

export const uploadPdf = async (file: File): Promise<any> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const formData = new FormData();
  formData.append('file', file);
  if (workspaceId) formData.append('workspaceId', workspaceId);
  const { data } = await apiClient.post('/sources/pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const fetchNoteSources = async (): Promise<NoteSource[]> => {
  // Not implemented in backend fully ( NotesCollection model exists but no detailed logic)
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/sources?workspaceId=${workspaceId}`);
  return data.filter((s: any) => s.type === 'NOTES').map((s: any) => ({
      id: s.id,
      title: s.title,
      folder: 'General',
      tag: 'Note',
      updatedAt: s.updatedAt || s.createdAt,
      status: s.status.toLowerCase(),
  }));
};

export const ingestYouTube = async (url: string): Promise<any> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.post('/sources/youtube', { 
      workspaceId,
      url 
  });
  return data;
};

export const uploadNotes = async (file: File): Promise<any> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const formData = new FormData();
  formData.append('file', file);
  if (workspaceId) formData.append('workspaceId', workspaceId);
  const { data } = await apiClient.post('/sources/notes/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const syncNotes = async (): Promise<{ synced: number }> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.post(`/sources/sync-notes?workspaceId=${workspaceId}`);
  return data;
};

export const deleteSource = async (id: string): Promise<void> => {
  const workspaceId = localStorage.getItem('workspaceId');
  await apiClient.delete(`/sources/${id}?workspaceId=${workspaceId}`);
};

export const reindexSource = async (id: string): Promise<void> => {
  const workspaceId = localStorage.getItem('workspaceId');
  await apiClient.post(`/sources/${id}/reindex?workspaceId=${workspaceId}`);
};

export interface VideoSnapshot {
  timestamp: number;
  timestampDisplay: string;
  label: string;
  spriteUrl: string;
  frameWidth: number;
  frameHeight: number;
  x: number;
  y: number;
}

export interface SummaryResult {
  videoId: string;
  title: string | null;
  cached: boolean;
  summary: {
    overview: string;
    keyPoints: string[];
    chapters?: { title: string; timestampStart: string; timestampEnd: string; summary: string }[];
  };
  snapshots?: VideoSnapshot[];
}

export const summarizeSource = async (id: string): Promise<SummaryResult> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.post(`/sources/${id}/summarize?workspaceId=${workspaceId}`);
  return data;
};

/* ===== Chat ===== */
export const fetchChatSessions = async (): Promise<ChatSession[]> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/chat/sessions?workspaceId=${workspaceId}`);
  return data.map((s: any) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.createdAt.split('T')[0], // Should be updatedAt
      messageCount: 0, // Backend might need to return count
      lastMessage: '', // Adding placeholder for TS type satisfaction
  }));
};

export const createChatSession = async (title: string = 'New Chat'): Promise<ChatSession> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.post('/chat/sessions', {
      workspaceId,
      title,
  });
  return {
      id: data.id,
      title: data.title,
      updatedAt: data.createdAt.split('T')[0],
      messageCount: 0, // Backend might need to return count
      lastMessage: '', // Adding placeholder for TS type satisfaction
  };
};

const mapCitation = (c: any) => {
  let type: 'youtube' | 'pdf' | 'note';
  if (c.sourceType === 'YOUTUBE') type = 'youtube';
  else if (c.sourceType === 'PDF') type = 'pdf';
  else type = 'note';
  return {
    type,
    title: c.title,
    startTime: c.timestampStart,
    endTime: c.timestampEnd,
    page: c.page,
    heading: c.heading,
    chunkText: c.snippet,
  };
};

export const fetchChatMessages = async (sessionId: string): Promise<ChatMessage[]> => {
  const { data } = await apiClient.get(`/chat/sessions/${sessionId}/messages`);
  return data.map((m: any) => ({
      id: m.id,
      role: m.sender === 'USER' ? 'user' : 'assistant',
      content: m.content,
      timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      citations: (m.citations || []).map(mapCitation),
  }));
};

export const sendChatMessage = async (
  sessionId: string,
  message: string,
  mode: string,
  strictSources: boolean = false,
  sourceIds?: string[],
): Promise<ChatMessage> => {
    const { data } = await apiClient.post(`/chat/sessions/${sessionId}/messages`, {
        content: message,
        mode: mode.toUpperCase(),
        strictSources,
        ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
    });
    
    // Map response to match ChatMessage type
    // Backend returns { userMessage, assistantMessage }
    // But frontend expects the *response* message usually?
    // Wait, useMutation returns the result.
    // If we want to optimistically update, we need both.
    // But here we rely on invalidateQueries to fetch messages again.
    // So return value isn't critical for rendering, but helps debugging.
    return {
        id: data.assistantMessage.id,
        role: 'assistant',
        content: data.assistantMessage.content,
        timestamp: new Date(data.assistantMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citations: (data.assistantMessage.citations || []).map(mapCitation),
    };
};

/* ===== Insights & Admin ===== */
export const fetchInsights = async (): Promise<InsightsData> => {
  const workspaceId = localStorage.getItem('workspaceId');
  const { data } = await apiClient.get(`/analytics/insights?workspaceId=${workspaceId}`);
  return data;
};

export const fetchAdminUsers = async (): Promise<AdminUser[]> => {
  const { mockAdminUsers } = await import('./mock-data');
  return mockAdminUsers;
};

export const fetchApiKeys = async (): Promise<ApiKey[]> => {
   const { mockApiKeys } = await import('./mock-data');
   return mockApiKeys;
};
