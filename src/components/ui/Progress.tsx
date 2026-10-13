import React from 'react';
import { Check } from 'lucide-react';
import './Progress.css';

interface ProgressBarProps {
    value: number; /* 0–100 */
    label?: string;
    size?: 'sm' | 'md';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, size = 'md' }) => (
    <div className="progress-wrapper">
        {label && <span className="progress-label">{label}</span>}
        <div className={`progress-track progress-track-${size}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
    </div>
);

interface Step {
    label: string;
    status: 'completed' | 'active' | 'pending';
}

interface PipelineStepperProps {
    steps: Step[];
}

export const PipelineStepper: React.FC<PipelineStepperProps> = ({ steps }) => (
    <div className="stepper">
        {steps.map((step, i) => (
            <React.Fragment key={step.label}>
                <div className={`stepper-step stepper-${step.status}`}>
                    <div className="stepper-circle">
                        {step.status === 'completed' ? <Check size={12} /> : <span>{i + 1}</span>}
                    </div>
                    <span className="stepper-label">{step.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`stepper-line ${step.status === 'completed' ? 'stepper-line-done' : ''}`} />}
            </React.Fragment>
        ))}
    </div>
);
