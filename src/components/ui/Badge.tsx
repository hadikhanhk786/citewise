import React from 'react';
import './Badge.css';

interface BadgeProps {
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
    dot?: boolean;
    children: React.ReactNode;
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', dot = false, children, className = '' }) => (
    <span className={`badge badge-${variant} ${className}`}>
        {dot && <span className="badge-dot" />}
        {children}
    </span>
);
