import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Lock, Mail, User } from 'lucide-react';
import { apiClient } from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { Input, Button } from '../components/ui';
import './LoginPage.css';

// Sign-up only works from an invite link: /register?email=...&invite=...
export const RegisterPage: React.FC = () => {
    const [params] = useSearchParams();
    const invite = params.get('invite') || '';
    const email = params.get('email') || '';
    const [name, setName] = useState('');
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
            const { data } = await apiClient.post('/auth/register', { email, password, name, invite });
            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            setError((isAxiosError(err) && err.response?.data?.message) || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <h1>Join Citewise</h1>
                    <p>{invite ? 'You have been invited. Set up your account.' : 'Citewise is invite-only.'}</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                {invite && email ? (
                    <form onSubmit={handleSubmit} className="login-form">
                        <Input type="email" value={email} readOnly icon={<Mail size={16} />} aria-label="Email" />
                        <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
                            icon={<User size={16} />} minLength={2} required />
                        <Input type="password" placeholder="Password (min 8 characters)" value={password}
                            onChange={e => setPassword(e.target.value)} icon={<Lock size={16} />} minLength={8} required />
                        <Button type="submit" loading={loading} fullWidth>Create account</Button>
                    </form>
                ) : (
                    <p className="login-note">Ask the owner for an invite link to create an account.</p>
                )}
                <p className="login-note"><Link to="/login">Back to sign in</Link></p>
            </div>
        </div>
    );
};
