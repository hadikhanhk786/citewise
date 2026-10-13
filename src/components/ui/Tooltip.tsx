import React, { useState, useRef } from 'react';
import './Tooltip.css';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const show = () => { clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => setVisible(true), 200); };
    const hide = () => { clearTimeout(timeoutRef.current); setVisible(false); };

    return (
        <div className="tooltip-wrapper" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
            {children}
            {visible && (
                <div className={`tooltip tooltip-${position}`} role="tooltip">
                    {content}
                    <span className="tooltip-arrow" />
                </div>
            )}
        </div>
    );
};
