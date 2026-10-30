'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '@/types';
import { SEED_PROFILES } from '@/lib/data-store';

interface AuthContextType {
  currentProfile: Profile;
  setRole: (role: UserRole) => void;
  availableProfiles: Profile[];
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Default to Control Room Admin for comprehensive immediate review
  const [currentProfile, setCurrentProfile] = useState<Profile>(SEED_PROFILES[0]);

  useEffect(() => {
    const saved = localStorage.getItem('civiscope_demo_role');
    if (saved) {
      const match = SEED_PROFILES.find(p => p.role === saved);
      if (match) setCurrentProfile(match);
    }
  }, []);

  const setRole = (role: UserRole) => {
    const match = SEED_PROFILES.find(p => p.role === role);
    if (match) {
      setCurrentProfile(match);
      localStorage.setItem('civiscope_demo_role', role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentProfile,
        setRole,
        availableProfiles: SEED_PROFILES,
        isAuthenticated: true,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
