import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiClient } from '../lib/axios';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    workspaceMemberships: Array<{ workspaceId: string, role: string }>;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const { data } = await apiClient.get('/me');
                    setUser(data);
                    if (data?.workspaceMemberships?.[0]) {
                        localStorage.setItem('workspaceId', data.workspaceMemberships[0].workspaceId);
                    }
                } catch (error) {
                    console.error('Failed to fetch user', error);
                    localStorage.removeItem('token');
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = (token: string, userData: User) => {
        localStorage.setItem('token', token);
        setUser(userData);
        if (userData?.workspaceMemberships?.[0]) {
            localStorage.setItem('workspaceId', userData.workspaceMemberships[0].workspaceId);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('workspaceId');
        setUser(null);
        window.location.href = `${import.meta.env.BASE_URL}login`;
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
