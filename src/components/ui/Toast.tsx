import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import './Toast.css';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    variant: ToastVariant;
}

interface ToastContextType {
    addToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => { } });

export const useToast = () => useContext(ToastContext);

const icons: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle2 size={18} />,
    error: <AlertCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, variant }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast-container" aria-live="polite">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.variant}`} role="alert">
                        <span className="toast-icon">{icons[t.variant]}</span>
                        <span className="toast-message">{t.message}</span>
                        <button className="toast-dismiss" onClick={() => removeToast(t.id)} aria-label="Dismiss">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
