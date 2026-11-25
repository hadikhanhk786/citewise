import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { Input, Button } from '../components/ui';
import { Lock, Mail } from 'lucide-react';
import './LoginPage.css';
import { isAxiosError } from 'axios';

const getErrorMessage = (err: unknown, fallback: string): string =>
    (isAxiosError(err) && err.response?.data?.message) || fallback;

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await apiClient.post('/auth/login', { email, password });
            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            setError(getErrorMessage(err, 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    // Quick register for demo
    const handleRegister = async () => {
        setError('');
        setLoading(true);
        try {
            // Register with default name
            const { data } = await apiClient.post('/auth/register', {
                email,
                password,
                name: email.split('@')[0]
            });
            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            setError(getErrorMessage(err, 'Registration failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to My Learning Copilot</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit} className="login-form">
                    <Input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        icon={<Mail size={16} />}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<Lock size={16} />}
                        required
                    />

                    <Button type="submit" loading={loading} fullWidth>
                        Sign In
                    </Button>

                    <div className="login-divider">or</div>

                    <Button type="button" variant="secondary" onClick={handleRegister} loading={loading} fullWidth>
                        Create Account
                    </Button>
                </form>
            </div>
        </div>
    );
};
