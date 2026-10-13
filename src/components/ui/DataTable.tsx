import React from 'react';
import './DataTable.css';

export interface Column<T> {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    width?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    keyField: keyof T;
    emptyState?: React.ReactNode;
    loading?: boolean;
    onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, data, keyField, emptyState, onRowClick }: DataTableProps<T>) {
    if (data.length === 0 && emptyState) {
        return <div className="table-empty">{emptyState}</div>;
    }

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col.key} style={{ width: col.width }}>{col.header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map(row => (
                        <tr
                            key={String(row[keyField])}
                            onClick={() => onRowClick?.(row)}
                            className={onRowClick ? 'table-row-clickable' : ''}
                        >
                            {columns.map(col => (
                                <td key={col.key}>
                                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
