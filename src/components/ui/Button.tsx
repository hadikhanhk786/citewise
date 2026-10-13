import React from 'react';
import { Loader2 } from 'lucide-react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}) => (
  <button
    className={`btn btn-${variant} btn-${size} ${fullWidth ? 'btn-full-width' : ''} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <Loader2 className="btn-spinner" size={16} /> : icon && <span className="btn-icon">{icon}</span>}
    {children && <span>{children}</span>}
  </button>
);
