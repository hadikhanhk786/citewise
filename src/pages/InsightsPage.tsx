import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Badge, DataTable, Modal, Button, SkeletonCard } from '../components/ui';
import type { Column } from '../components/ui';
import { useInsights } from '../hooks/useApi';
import './InsightsPage.css';

const chartTooltipStyle = {
    contentStyle: { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 },
    labelStyle: { color: 'var(--color-text-secondary)' },
    itemStyle: { color: 'var(--color-text-primary)' },
};

export const InsightsPage: React.FC = () => {
    const { data, isLoading } = useInsights();
    const [feedbackModal, setFeedbackModal] = useState(false);

    if (isLoading || !data) {
        return (
            <div>
                <PageHeader title="Insights" subtitle="Analytics, quality metrics, and audit log" />
                <div className="insights-metrics">
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    const auditColumns: Column<typeof data.auditLog[0]>[] = [
        {
            key: 'action', header: 'Action', width: '90px', render: (r) => {
                const v = r.action === 'Error' ? 'error' : r.action === 'Query' ? 'info' : r.action === 'Index' ? 'success' : 'neutral';
                return <Badge variant={v}>{r.action}</Badge>;
            }
        },
        { key: 'user', header: 'User', width: '140px' },
        { key: 'details', header: 'Details' },
        { key: 'timestamp', header: 'Time', width: '100px' },
    ];

    return (
        <div className="insights-page">
            <PageHeader title="Insights" subtitle="Analytics, quality metrics, and audit log" />

            {/* Metric Cards */}
            <div className="insights-metrics">
                <div className="metric-card">
                    <span className="metric-label">Queries / Day (Avg)</span>
                    <span className="metric-value">{Math.round(data.queriesPerDay.reduce((a, b) => a + b.count, 0) / data.queriesPerDay.length)}</span>
                </div>
                <div className="metric-card">
                    <span className="metric-label">Avg Latency</span>
                    <span className="metric-value">{data.avgLatency}ms</span>
                </div>
                <div className="metric-card">
                    <span className="metric-label">Cost Estimate</span>
                    <span className="metric-value">{data.costEstimate}</span>
                </div>
                <div className="metric-card">
                    <span className="metric-label">No-Answer Rate</span>
                    <span className="metric-value metric-warning">{data.noAnswerRate}%</span>
                </div>
            </div>

            {/* Charts */}
            <div className="insights-charts">
                <div className="chart-card">
                    <h3 className="card-title">Queries Per Day</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.queriesPerDay}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={11} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                            <RechartsTooltip {...chartTooltipStyle} />
                            <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card">
                    <h3 className="card-title">Latency Trend</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={data.queriesPerDay.map((d, i) => ({ ...d, latency: 380 + Math.sin(i) * 70 }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={11} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                            <RechartsTooltip {...chartTooltipStyle} />
                            <Line type="monotone" dataKey="latency" stroke="var(--color-warning)" strokeWidth={2} dot={{ fill: 'var(--color-warning)', r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quality + Feedback */}
            <div className="insights-quality">
                <div className="quality-card">
                    <h3 className="card-title">Retrieval Quality</h3>
                    <div className="quality-score">
                        <div className="quality-ring">
                            <svg viewBox="0 0 100 100" width="100" height="100">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-border)" strokeWidth="6" />
                                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-success)" strokeWidth="6"
                                    strokeDasharray={`${data.retrievalQuality * 2.64} 264`}
                                    strokeLinecap="round" transform="rotate(-90 50 50)"
                                />
                            </svg>
                            <span className="quality-pct">{data.retrievalQuality}%</span>
                        </div>
                        <div className="quality-details">
                            <p>Based on user feedback and source matching confidence across all queries.</p>
                        </div>
                    </div>
                </div>
                <div className="feedback-card">
                    <h3 className="card-title">User Feedback</h3>
                    <div className="feedback-stats">
                        <div className="feedback-stat feedback-positive">
                            <ThumbsUp size={18} />
                            <span className="feedback-count">{data.thumbsUp}</span>
                            <span className="feedback-label">Helpful</span>
                        </div>
                        <div className="feedback-stat feedback-negative">
                            <ThumbsDown size={18} />
                            <span className="feedback-count">{data.thumbsDown}</span>
                            <span className="feedback-label">Not helpful</span>
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setFeedbackModal(true)} icon={<MessageSquare size={14} />}>
                        View Comments
                    </Button>
                </div>
            </div>

            {/* Audit Log */}
            <div className="audit-section">
                <h3 className="card-title">Audit Log</h3>
                <DataTable columns={auditColumns} data={data.auditLog} keyField="id" />
            </div>

            {/* Feedback Modal */}
            <Modal open={feedbackModal} onClose={() => setFeedbackModal(false)} title="Feedback Comments" size="md">
                <div className="feedback-comments">
                    <div className="feedback-comment">
                        <div className="comment-header">
                            <Badge variant="success"><ThumbsUp size={10} /> Helpful</Badge>
                            <span className="comment-time">10:31 AM</span>
                        </div>
                        <p className="comment-text">"Great explanation of attention mechanisms, very clear with the video citations."</p>
                    </div>
                    <div className="feedback-comment">
                        <div className="comment-header">
                            <Badge variant="error"><ThumbsDown size={10} /> Not helpful</Badge>
                            <span className="comment-time">09:15 AM</span>
                        </div>
                        <p className="comment-text">"The answer didn't reference the specific section I was asking about."</p>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
