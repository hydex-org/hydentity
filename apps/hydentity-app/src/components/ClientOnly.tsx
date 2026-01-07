'use client';

import { useState, useEffect } from 'react';

interface ClientOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-only wrapper to prevent hydration mismatch
 * Components that depend on client-side state (like wallet connection)
 * should be wrapped in this component.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

