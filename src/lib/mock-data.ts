/* ===== Types ===== */
export interface YouTubeSource {
  id: string;
  title: string;
  url: string;
  addedAt: string;
  status: 'indexing' | 'ready' | 'error';
  pipeline: { loaded: boolean; chunked: boolean; embedded: boolean; indexed: boolean };
  errorReason?: string;
  errorCode?: string;
}

export interface NoteSource {
  id: string;
  title: string;
  folder: string;
  tag: string;
  updatedAt: string;
  status: 'synced' | 'indexing' | 'error';
}

export interface PdfSource {
  id: string;
  title: string;
  filename: string;
  pageCount?: number;
  addedAt: string;
  status: 'indexing' | 'ready' | 'error';
  errorReason?: string;
  errorCode?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  mode?: 'youtube' | 'notes' | 'hybrid';
}

export interface Citation {
  type: 'youtube' | 'pdf' | 'note';
  title: string;
  // YouTube
  startTime?: string;
  endTime?: string;
  videoUrl?: string;
  // PDF
  page?: number;
  // Notes
  heading?: string;
  updatedAt?: string;
  // Both
  chunkText: string;
}

export interface DashboardKPI {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ActivityItem {
  id: string;
  type: 'indexed' | 'chat' | 'upload' | 'error';
  description: string;
  timestamp: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  lastActive: string;
}

export interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  createdAt: string;
  lastUsed: string;
}

/* ===== Mock Data ===== */
export const mockYouTubeSources: YouTubeSource[] = [
  { id: '1', title: 'Intro to Transformers — 3Blue1Brown', url: 'https://youtube.com/watch?v=abc123', addedAt: '2026-02-14', status: 'ready', pipeline: { loaded: true, chunked: true, embedded: true, indexed: true } },
  { id: '2', title: 'RAG Architecture Deep Dive', url: 'https://youtube.com/watch?v=def456', addedAt: '2026-02-15', status: 'indexing', pipeline: { loaded: true, chunked: true, embedded: false, indexed: false } },
  { id: '3', title: 'Vector Databases Explained', url: 'https://youtube.com/watch?v=ghi789', addedAt: '2026-02-16', status: 'error', pipeline: { loaded: true, chunked: false, embedded: false, indexed: false } },
  { id: '4', title: 'Fine-tuning LLMs for Enterprise', url: 'https://youtube.com/watch?v=jkl012', addedAt: '2026-02-13', status: 'ready', pipeline: { loaded: true, chunked: true, embedded: true, indexed: true } },
  { id: '5', title: 'Prompt Engineering Masterclass', url: 'https://youtube.com/watch?v=mno345', addedAt: '2026-02-12', status: 'ready', pipeline: { loaded: true, chunked: true, embedded: true, indexed: true } },
];

export const mockNoteSources: NoteSource[] = [
  { id: 'n1', title: 'ML System Design Notes', folder: 'Engineering', tag: 'ML', updatedAt: '2026-02-15', status: 'synced' },
  { id: 'n2', title: 'Product Requirements — Q1', folder: 'Product', tag: 'PRD', updatedAt: '2026-02-14', status: 'synced' },
  { id: 'n3', title: 'Research: Embedding Models', folder: 'Research', tag: 'AI', updatedAt: '2026-02-16', status: 'indexing' },
  { id: 'n4', title: 'Meeting Notes — Feb Standup', folder: 'Meetings', tag: 'Internal', updatedAt: '2026-02-13', status: 'synced' },
];

export const mockChatSessions: ChatSession[] = [
  { id: 's1', title: 'How do transformers handle attention?', lastMessage: 'The self-attention mechanism...', updatedAt: '2026-02-16 10:32', messageCount: 8 },
  { id: 's2', title: 'Compare RAG vs fine-tuning', lastMessage: 'RAG is better suited for...', updatedAt: '2026-02-15 16:45', messageCount: 12 },
  { id: 's3', title: 'Summarize my Q1 product notes', lastMessage: 'Based on your notes, the key...', updatedAt: '2026-02-14 09:20', messageCount: 4 },
  { id: 's4', title: 'Vector DB performance benchmarks', lastMessage: 'According to the video...', updatedAt: '2026-02-13 14:10', messageCount: 6 },
];

export const mockChatMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'How do transformers handle long-range dependencies through the self-attention mechanism?', timestamp: '10:30 AM', mode: 'hybrid' },
  {
    id: 'm2', role: 'assistant', content: 'Transformers handle long-range dependencies through the **self-attention mechanism**, which allows each token in a sequence to attend to every other token directly, regardless of distance.\n\nUnlike RNNs that process sequences step-by-step (making distant relationships hard to capture), self-attention computes relationships in parallel across all positions.\n\nThe key insight is the **Query-Key-Value** framework: each token generates Q, K, and V vectors. Attention scores are computed as dot products between queries and keys, then normalized via softmax to create weighted combinations of values.',
    timestamp: '10:31 AM',
    citations: [
      { type: 'youtube', title: 'Intro to Transformers — 3Blue1Brown', startTime: '03:12', endTime: '04:05', videoUrl: 'https://youtube.com/watch?v=abc123', chunkText: 'The self-attention mechanism allows each word to look at every other word in the sentence, computing a relevance score...' },
      { type: 'note', title: 'ML System Design Notes', heading: 'Transformer Architecture', updatedAt: '2026-02-15', chunkText: 'Self-attention computes pairwise interactions between all positions in O(n²) time complexity, enabling direct long-range dependency modeling.' },
    ],
  },
  { id: 'm3', role: 'user', content: 'What are the computational trade-offs with this approach?', timestamp: '10:33 AM', mode: 'hybrid' },
  {
    id: 'm4', role: 'assistant', content: 'The main trade-off is the **O(n²) computational complexity** of self-attention, where n is the sequence length. This makes transformers memory-intensive for very long sequences.\n\nSeveral approaches address this:\n- **Sparse attention** (e.g., Longformer) reduces to O(n·k)\n- **Linear attention** approximates softmax with kernel methods\n- **Flash Attention** optimizes GPU memory access patterns\n- **Sliding window approaches** limit attention to local neighborhoods',
    timestamp: '10:34 AM',
    citations: [
      { type: 'youtube', title: 'RAG Architecture Deep Dive', startTime: '15:20', endTime: '17:45', videoUrl: 'https://youtube.com/watch?v=def456', chunkText: 'The quadratic complexity of attention means processing a 4K token sequence requires 16M attention computations...' },
    ],
  },
];

export const mockDashboardKPIs: DashboardKPI[] = [
  { label: 'Indexed Sources', value: '23', change: '+3', trend: 'up' },
  { label: 'Recent Chats', value: '47', change: '+12', trend: 'up' },
  { label: 'Last Sync', value: '2m ago', trend: 'neutral' },
  { label: 'Usage / Quota', value: '68%', change: '1.2K / 2K', trend: 'neutral' },
];

export const mockActivityItems: ActivityItem[] = [
  { id: 'a1', type: 'indexed', description: 'Indexed "Intro to Transformers" video', timestamp: '2 min ago' },
  { id: 'a2', type: 'chat', description: 'New chat: "How do transformers handle attention?"', timestamp: '15 min ago' },
  { id: 'a3', type: 'upload', description: 'Uploaded "ML System Design Notes"', timestamp: '1 hour ago' },
  { id: 'a4', type: 'error', description: 'Failed to fetch transcript for "Vector DBs Explained"', timestamp: '2 hours ago' },
  { id: 'a5', type: 'indexed', description: 'Re-indexed "Fine-tuning LLMs" video', timestamp: '3 hours ago' },
  { id: 'a6', type: 'chat', description: 'Chat: "Compare RAG vs fine-tuning"', timestamp: '5 hours ago' },
];

export const mockUsageTrend = [
  { date: 'Mon', queries: 32, latency: 420 },
  { date: 'Tue', queries: 45, latency: 380 },
  { date: 'Wed', queries: 28, latency: 450 },
  { date: 'Thu', queries: 62, latency: 410 },
  { date: 'Fri', queries: 55, latency: 390 },
  { date: 'Sat', queries: 18, latency: 360 },
  { date: 'Sun', queries: 24, latency: 400 },
];

export const mockInsightsData = {
  queriesPerDay: [
    { date: 'Feb 10', count: 28 },
    { date: 'Feb 11', count: 42 },
    { date: 'Feb 12', count: 35 },
    { date: 'Feb 13', count: 51 },
    { date: 'Feb 14', count: 48 },
    { date: 'Feb 15', count: 62 },
    { date: 'Feb 16', count: 38 },
  ],
  avgLatency: 450,
  costEstimate: '$12.40',
  noAnswerRate: 8.5,
  retrievalQuality: 87,
  thumbsUp: 142,
  thumbsDown: 18,
  auditLog: [
    { id: 'l1', action: 'Query', user: 'alex@company.io', details: 'Hybrid search: "transformer attention"', timestamp: '10:31 AM' },
    { id: 'l2', action: 'Index', user: 'system', details: 'Indexed youtube/abc123 (5 chunks)', timestamp: '10:15 AM' },
    { id: 'l3', action: 'Upload', user: 'alex@company.io', details: 'Uploaded ML System Design Notes', timestamp: '09:45 AM' },
    { id: 'l4', action: 'Error', user: 'system', details: 'Transcript fetch failed for youtube/ghi789', timestamp: '09:30 AM' },
    { id: 'l5', action: 'Query', user: 'sara@company.io', details: 'Notes search: "Q1 product requirements"', timestamp: '09:12 AM' },
  ],
};

export const mockAdminUsers: AdminUser[] = [
  { id: 'u1', name: 'Alex Kim', email: 'alex@company.io', role: 'admin', lastActive: '2 min ago' },
  { id: 'u2', name: 'Sara Chen', email: 'sara@company.io', role: 'member', lastActive: '1 hour ago' },
  { id: 'u3', name: 'Mike Johnson', email: 'mike@company.io', role: 'viewer', lastActive: '3 days ago' },
];

export const mockApiKeys: ApiKey[] = [
  { id: 'k1', name: 'Production API', maskedKey: 'sk-****...7x2f', createdAt: '2026-01-15', lastUsed: '2 min ago' },
  { id: 'k2', name: 'Development', maskedKey: 'sk-****...9a3b', createdAt: '2026-02-01', lastUsed: '1 day ago' },
];
