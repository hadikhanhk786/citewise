import React from 'react';
import {
    ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { parseChartSpec } from '../lib/chartSpec';

const PIE_COLORS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-info)', '#a78bfa', '#f472b6'];

const tooltipStyle = {
    contentStyle: { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 },
    labelStyle: { color: 'var(--color-text-secondary)' },
    itemStyle: { color: 'var(--color-text-primary)' },
};

/** Renders a ```chart block from an answer; falls back to the raw text if the JSON is malformed. */
export const ChatChart: React.FC<{ source: string }> = ({ source }) => {
    const spec = parseChartSpec(source);
    if (!spec) return <pre><code>{source}</code></pre>;

    return (
        <figure className="chat-chart">
            {spec.title && <figcaption>{spec.title}</figcaption>}
            <ResponsiveContainer width="100%" height={240}>
                {spec.type === 'pie' ? (
                    <PieChart>
                        <Pie data={spec.data} dataKey="value" nameKey="label" outerRadius={90} label>
                            {spec.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} />
                    </PieChart>
                ) : spec.type === 'line' ? (
                    <LineChart data={spec.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="label" stroke="var(--color-text-tertiary)" fontSize={11} />
                        <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                        <Tooltip {...tooltipStyle} />
                        <Line type="monotone" dataKey="value" stroke="var(--color-accent)" strokeWidth={2} />
                    </LineChart>
                ) : (
                    <BarChart data={spec.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="label" stroke="var(--color-text-tertiary)" fontSize={11} />
                        <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="value" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </figure>
    );
};
