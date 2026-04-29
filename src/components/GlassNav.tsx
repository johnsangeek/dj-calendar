'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface GlassNavProps {
  title?: string;
  backHref?: string;
  children?: ReactNode;
}

export const GlassNav = ({ title, backHref = '/', children }: GlassNavProps) => {
  return (
    <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <Link href={backHref} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              {title || 'DJ Booker Pro'}
            </span>
          </div>
          {children}
        </div>
      </div>
    </nav>
  );
};
