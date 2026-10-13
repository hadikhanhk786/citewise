import React from 'react';
import { Search } from 'lucide-react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    helperText?: string;
    error?: string;
    isSearch?: boolean;
    icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ label, helperText, error, isSearch, icon, className = '', id, ...props }, ref) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
        return (
            <div className={`input-wrapper ${error ? 'input-error' : ''} ${className}`}>
                {label && <label htmlFor={inputId} className="input-label">{label}</label>}
                <div className="input-container">
                    {(isSearch || icon) && (
                        <span className="input-icon">{icon || <Search size={16} />}</span>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        className={`input-field ${isSearch || icon ? 'input-with-icon' : ''}`}
                        aria-invalid={!!error}
                        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
                        {...props}
                    />
                </div>
                {error && <p id={`${inputId}-error`} className="input-error-text" role="alert">{error}</p>}
                {helperText && !error && <p id={`${inputId}-helper`} className="input-helper">{helperText}</p>}
            </div>
        );
    }
);
Input.displayName = 'Input';
