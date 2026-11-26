import axios from 'axios';
import { parseApiError } from './errors';

// Create axios instance
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if needed
      // preventing infinite loop if login fails
      if (!window.location.pathname.startsWith(`${import.meta.env.BASE_URL}login`)) {
        localStorage.removeItem('token');
        window.location.href = `${import.meta.env.BASE_URL}login`;
      }
    }
    // Normalize to our ApiError shape and attach for consumers.
    (error as { apiError?: unknown }).apiError = parseApiError(error);
    return Promise.reject(error);
  }
);
