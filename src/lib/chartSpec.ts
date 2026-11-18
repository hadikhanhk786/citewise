// Shape the chat model is asked to emit in a ```chart block (see python-service llm.py).
export interface ChartSpec {
    type: 'bar' | 'line' | 'pie';
    title?: string;
    data: { label: string; value: number }[];
}

export function parseChartSpec(source: string): ChartSpec | null {
    try {
        const spec = JSON.parse(source);
        const data = Array.isArray(spec?.data)
            ? spec.data
                .map((d: { label?: unknown; value?: unknown }) => ({ label: String(d.label ?? ''), value: Number(d.value) }))
                .filter((d: { value: number }) => Number.isFinite(d.value))
            : [];
        if (!['bar', 'line', 'pie'].includes(spec?.type) || data.length === 0) return null;
        return { type: spec.type, title: typeof spec.title === 'string' ? spec.title : undefined, data };
    } catch {
        return null;
    }
}
