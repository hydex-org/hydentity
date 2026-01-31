'use client';

import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { ClientOnly } from './ClientOnly';
import { NetworkSwitcher } from './NetworkSwitcher';

export function Header() {
  const { connected } = useWallet();

  return (
    <motion.header 
      className="sticky top-0 z-50 bg-hx-bg/80 backdrop-blur-md border-b border-hx-text/10"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
            <path d="M8 8h16v4H8V8z" fill="#97f01d"/>
            <path d="M8 14h12v4H8v-4z" fill="#97f01d" opacity="0.7"/>
            <path d="M8 20h8v4H8v-4z" fill="#97f01d" opacity="0.4"/>
          </svg>
          <span className="text-xl font-semibold text-hx-white">hydentity</span>
        </Link>

        {/* Navigation */}
        <ClientOnly>
          {connected && (
            <nav className="hidden md:flex items-center gap-6">
              <NavLink href="/" active>Dashboard</NavLink>
              <NavLink href="/setup">Setup</NavLink>
              <NavLink href="/claim">Claim</NavLink>
              <NavLink href="/settings">Settings</NavLink>
              <a
                href="https://hydex.gitbook.io/hydentity/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-hx-text hover:text-hx-white transition-colors"
              >
                Docs
              </a>
            </nav>
          )}
        </ClientOnly>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Network Switcher */}
          <ClientOnly>
            <NetworkSwitcher />
          </ClientOnly>

          {/* Hyde XP Badge */}
          <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-hx-card-bg rounded-lg border border-hx-text/10">
            <span className="text-hx-green font-semibold text-sm">HYDE</span>
            <span className="text-hx-green font-bold">XP</span>
            <span className="text-hx-white font-semibold ml-1">0.0</span>
          </div>

          <ClientOnly fallback={<div className="h-10 w-32 bg-hx-card-bg rounded-lg animate-pulse" />}>
            <WalletMultiButton />
          </ClientOnly>
        </div>
      </div>
    </motion.header>
  );
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link 
      href={href}
      className={`text-sm font-medium transition-colors ${
        active ? 'text-hx-white' : 'text-hx-text hover:text-hx-white'
      }`}
    >
      {children}
    </Link>
  );
}
