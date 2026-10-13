import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
    variant?: 'line' | 'circle' | 'card';
    width?: string;
    height?: string;
    count?: number;
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'line', width, height, count = 1, className = '' }) => {
    const items = Array.from({ length: count });
    return (
        <>
            {items.map((_, i) => (
                <div
                    key={i}
                    className={`skeleton skeleton-${variant} ${className}`}
                    style={{ width, height }}
                    aria-hidden="true"
                />
            ))}
        </>
    );
};

export const SkeletonCard: React.FC = () => (
    <div className="skeleton-card-wrapper">
        <Skeleton height="16px" width="40%" />
        <Skeleton height="32px" width="60%" />
        <Skeleton height="12px" width="80%" />
    </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
    <div className="skeleton-table">
        <div className="skeleton-table-header">
            {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} height="14px" />)}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="skeleton-table-row">
                {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} height="14px" />)}
            </div>
        ))}
    </div>
);
