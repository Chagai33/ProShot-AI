'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

interface AuthContextType {
  user: User | null | undefined;
  loading: boolean;
  signInAnonymously: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: undefined,
  loading: true,
  signInAnonymously: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, loading, error] = useAuthState(auth);

  const handleAnonymousSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Error signing in anonymously:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInAnonymously: handleAnonymousSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}
