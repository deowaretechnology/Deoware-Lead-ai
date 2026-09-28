'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, businessName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('crm_token');
    if (!token) {
      // One-time auth check on mount - safe, does not cascade (early exit, no deps change).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => Cookies.remove('crm_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, ...userData } = res.data.data;
    Cookies.set('crm_token', token, { expires: 7 });
    setUser(userData);
    router.push('/dashboard');
  };

  const register = async (name: string, email: string, password: string, businessName: string) => {
    const res = await api.post('/auth/register', { name, email, password, businessName });
    const { token, ...userData } = res.data.data;
    Cookies.set('crm_token', token, { expires: 7 });
    setUser(userData);
    router.push('/dashboard');
  };

  const logout = () => {
    Cookies.remove('crm_token');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
