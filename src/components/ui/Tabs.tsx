import React, { useState } from 'react';
import './Tabs.css';

export interface Tab {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    activeTab?: string;
    onChange?: (id: string) => void;
    children?: React.ReactNode;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab: controlledActive, onChange, children }) => {
    const [internalActive, setInternalActive] = useState(tabs[0]?.id);
    const active = controlledActive ?? internalActive;

    const handleSelect = (id: string) => {
        setInternalActive(id);
        onChange?.(id);
    };

    return (
        <div className="tabs-root">
            <div className="tabs-list" role="tablist">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={active === tab.id}
                        className={`tab-trigger ${active === tab.id ? 'tab-active' : ''}`}
                        onClick={() => handleSelect(tab.id)}
                        tabIndex={active === tab.id ? 0 : -1}
                    >
                        {tab.icon && <span className="tab-icon">{tab.icon}</span>}
                        {tab.label}
                    </button>
                ))}
            </div>
            <div role="tabpanel" className="tab-content">
                {children}
            </div>
        </div>
    );
};
