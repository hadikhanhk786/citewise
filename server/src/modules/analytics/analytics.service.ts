import { prisma } from '../../lib/prisma';

export const analyticsService = {
  async getDashboard(workspaceId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      indexedSourcesCount,
      totalSourcesCount,
      recentChatsCount,
      lastSyncResult,
      recentActivity,
      usageTrend,
    ] = await Promise.all([
      prisma.source.count({ where: { workspaceId, status: 'READY' } }),
      prisma.source.count({ where: { workspaceId } }),
      prisma.chatSession.count({ where: { workspaceId, createdAt: { gte: sevenDaysAgo } } }),
      prisma.source.aggregate({
        where: { workspaceId, lastSyncAt: { not: null } },
        _max: { lastSyncAt: true },
      }),
      prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, email: true } } },
      }),
      // Queries per day for last 7 days using chat messages
      prisma.$queryRaw<{ date: string; queries: bigint }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', cm.created_at), 'Dy') AS date,
          COUNT(*)::bigint AS queries
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.workspace_id = ${workspaceId}
          AND cm.sender = 'USER'
          AND cm.created_at >= ${sevenDaysAgo}
        GROUP BY DATE_TRUNC('day', cm.created_at)
        ORDER BY DATE_TRUNC('day', cm.created_at) ASC
      `,
    ]);

    const lastSyncAt = lastSyncResult._max.lastSyncAt;
    const lastSyncLabel = lastSyncAt ? formatRelativeTime(lastSyncAt) : 'Never';

    const kpis = [
      { label: 'Indexed Sources', value: String(indexedSourcesCount), change: `${totalSourcesCount} total`, trend: 'neutral' as const },
      { label: 'Recent Chats', value: String(recentChatsCount), change: 'last 7 days', trend: 'up' as const },
      { label: 'Last Sync', value: lastSyncLabel, trend: 'neutral' as const },
      { label: 'Total Sources', value: String(totalSourcesCount), trend: 'neutral' as const },
    ];

    const activity = recentActivity.map((log) => ({
      id: log.id,
      type: mapActionToType(log.action),
      description: formatActivityDescription(log.action, log.metadata, log.user?.name),
      timestamp: formatRelativeTime(log.createdAt),
    }));

    const usageTrendFormatted = usageTrend.map((row) => ({
      date: row.date,
      queries: Number(row.queries),
      latency: 0, // not tracked
    }));

    return { kpis, activity, usageTrend: usageTrendFormatted };
  },

  async getInsights(workspaceId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [queriesPerDayRaw, assistantMessages, auditLogs] = await Promise.all([
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', cm.created_at), 'Mon DD') AS date,
          COUNT(*)::bigint AS count
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.workspace_id = ${workspaceId}
          AND cm.sender = 'USER'
          AND cm.created_at >= ${sevenDaysAgo}
        GROUP BY DATE_TRUNC('day', cm.created_at)
        ORDER BY DATE_TRUNC('day', cm.created_at) ASC
      `,
      prisma.chatMessage.findMany({
        where: {
          sender: 'ASSISTANT',
          session: { workspaceId },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { citations: true },
      }),
      prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { email: true } } },
      }),
    ]);

    const totalAssistant = assistantMessages.length;
    const withCitations = assistantMessages.filter((m) => {
      const c = m.citations as any;
      return Array.isArray(c) && c.length > 0 && !c[0]?.error;
    }).length;

    const noAnswerRate = totalAssistant > 0
      ? Math.round(((totalAssistant - withCitations) / totalAssistant) * 100 * 10) / 10
      : 0;

    const retrievalQuality = totalAssistant > 0
      ? Math.round((withCitations / totalAssistant) * 100)
      : 0;

    const queriesPerDay = queriesPerDayRaw.map((r) => ({
      date: r.date,
      count: Number(r.count),
    }));

    const auditLog = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      user: log.user?.email ?? 'system',
      details: formatAuditDetails(log.action, log.metadata),
      timestamp: new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));

    return {
      queriesPerDay,
      avgLatency: 0, // not tracked server-side
      costEstimate: 'N/A',
      noAnswerRate,
      retrievalQuality,
      thumbsUp: 0, // no feedback model
      thumbsDown: 0,
      auditLog,
    };
  },
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function mapActionToType(action: string): 'indexed' | 'chat' | 'upload' | 'error' {
  const a = action.toUpperCase();
  if (a.includes('INDEX') || a.includes('INGEST') || a.includes('REINDEX')) return 'indexed';
  if (a.includes('CHAT') || a.includes('QUERY') || a.includes('SESSION')) return 'chat';
  if (a.includes('UPLOAD') || a.includes('SYNC') || a.includes('SOURCE')) return 'upload';
  if (a.includes('ERROR') || a.includes('FAIL')) return 'error';
  return 'chat';
}

function formatActivityDescription(action: string, metadata: any, userName?: string): string {
  const by = userName ? ` by ${userName}` : '';
  if (metadata?.title) return `${action}: "${metadata.title}"${by}`;
  if (metadata?.description) return `${metadata.description}${by}`;
  return `${action}${by}`;
}

function formatAuditDetails(action: string, metadata: any): string {
  if (!metadata) return action;
  if (metadata.title) return `${action}: "${metadata.title}"`;
  if (metadata.description) return metadata.description;
  if (metadata.query) return `${action}: "${metadata.query}"`;
  try {
    const keys = Object.keys(metadata).slice(0, 2);
    return keys.map((k) => `${k}: ${metadata[k]}`).join(', ') || action;
  } catch {
    return action;
  }
}
