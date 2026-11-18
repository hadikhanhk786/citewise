import React from 'react';
import { TrendingUp, TrendingDown, FileText, Zap, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '../components/layout';
import { Badge, DataTable, SkeletonCard } from '../components/ui';
import type { Column } from '../components/ui';
import { useDashboard } from '../hooks/useApi';
import type { ActivityItem } from '../lib/mock-data';
import './DashboardPage.css';

const activityColumns: Column<ActivityItem>[] = [
    {
        key: 'type', header: 'Type', width: '100px',
        render: (row) => {
            const v = row.type === 'error' ? 'error' : row.type === 'indexed' ? 'success' : row.type === 'chat' ? 'info' : 'neutral';
            return <Badge variant={v}>{row.type}</Badge>;
        },
    },
    { key: 'description', header: 'Description' },
    { key: 'timestamp', header: 'Time', width: '120px' },
];

export const DashboardPage: React.FC = () => {
    const { data, isLoading } = useDashboard();

    if (isLoading || !data) {
        return (
            <div>
                <PageHeader title="Dashboard" subtitle="Overview of your learning workspace" />
                <div className="kpi-grid">
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    const { kpis, activity, usageTrend } = data;

    return (
        <div className="dashboard-page">
            <PageHeader title="Dashboard" subtitle="Overview of your learning workspace" />

            {/* KPI Cards */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
                    <div key={i} className="kpi-card">
                        <span className="kpi-label">{kpi.label}</span>
                        <div className="kpi-value-row">
                            <span className="kpi-value">{kpi.value}</span>
                            {kpi.change && (
                                <span className={`kpi-change ${kpi.trend === 'up' ? 'kpi-up' : kpi.trend === 'down' ? 'kpi-down' : ''}`}>
                                    {kpi.trend === 'up' && <TrendingUp size={14} />}
                                    {kpi.trend === 'down' && <TrendingDown size={14} />}
                                    {kpi.change}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="section-title">Quick Actions</div>
            <div className="quick-actions">
                <button className="action-card">
                    <div className="action-icon action-icon-blue"><FileText size={20} /></div>
                    <div className="action-text">
                        <span className="action-label">Upload Notes</span>
                        <span className="action-desc">Import documents & notes</span>
                    </div>
                    <ArrowRight size={16} className="action-arrow" />
                </button>
                <button className="action-card">
                    <div className="action-icon action-icon-purple"><Zap size={20} /></div>
                    <div className="action-text">
                        <span className="action-label">Ask Hybrid Question</span>
                        <span className="action-desc">Query across all sources</span>
                    </div>
                    <ArrowRight size={16} className="action-arrow" />
                </button>
            </div>

            {/* Chart + Table */}
            <div className="dashboard-grid">
                <div className="chart-card">
                    <h3 className="card-title">Usage Trend</h3>
                    <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={usageTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="date" stroke="var(--color-text-tertiary)" fontSize={12} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                            <RechartsTooltip
                                contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }}
                                labelStyle={{ color: 'var(--color-text-secondary)' }}
                                itemStyle={{ color: 'var(--color-text-primary)' }}
                            />
                            <Line type="monotone" dataKey="queries" stroke="var(--color-accent)" strokeWidth={2} dot={{ fill: 'var(--color-accent)', r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="activity-card">
                    <h3 className="card-title">Recent Activity</h3>
                    <DataTable columns={activityColumns} data={activity} keyField="id" />
                </div>
            </div>
        </div>
    );
};
