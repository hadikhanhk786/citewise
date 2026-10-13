import React from 'react';
import { ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: SelectOption[];
    error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, options, error, className = '', id, ...props }, ref) => {
        const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
        return (
            <div className={`select-wrapper ${className}`}>
                {label && <label htmlFor={selectId} className="select-label">{label}</label>}
                <div className="select-container">
                    <select ref={ref} id={selectId} className="select-field" aria-invalid={!!error} {...props}>
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="select-chevron" size={16} />
                </div>
                {error && <p className="select-error" role="alert">{error}</p>}
            </div>
        );
    }
);
Select.displayName = 'Select';
