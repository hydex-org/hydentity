'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface TestModeContextValue {
  /** Whether test mode is enabled (bypasses SNS verification) */
  testMode: boolean;
  /** Toggle test mode on/off */
  toggleTestMode: () => void;
  /** Explicitly set test mode */
  setTestMode: (enabled: boolean) => void;
}

const TestModeContext = createContext<TestModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'hydentity_test_mode';

export function TestModeProvider({ children }: { children: React.ReactNode }) {
  const [testMode, setTestModeState] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setTestModeState(true);
      }
    }
  }, []);

  const setTestMode = useCallback((enabled: boolean) => {
    setTestModeState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    }
  }, []);

  const toggleTestMode = useCallback(() => {
    setTestMode(!testMode);
  }, [testMode, setTestMode]);

  return (
    <TestModeContext.Provider value={{ testMode, toggleTestMode, setTestMode }}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (!context) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
}

