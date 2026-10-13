import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import './Modal.css';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    variant?: 'default' | 'danger';
    size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer, variant = 'default', size = 'md' }) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    useEffect(() => {
        if (open && dialogRef.current) {
            const focusable = dialogRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        }
    }, [open]);

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div
                ref={dialogRef}
                className={`modal-content modal-${size}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-title" className={`modal-title ${variant === 'danger' ? 'modal-title-danger' : ''}`}>{title}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );
};

/* Convenience: Confirm Modal */
interface ConfirmModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    loading?: boolean;
    variant?: 'default' | 'danger';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading, variant = 'danger'
}) => (
    <Modal open={open} onClose={onClose} title={title} variant={variant} size="sm"
        footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
            </div>
        }
    >
        <p style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
    </Modal>
);
