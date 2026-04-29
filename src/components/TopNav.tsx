'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Home, Calendar, Users, MessageSquare, FileText, Settings, Instagram, Search, BarChart3, Bell, X, ExternalLink } from 'lucide-react';
import { usePendingInvoices } from '@/hooks/usePendingInvoices';

export const TopNav = () => {
  const pathname = usePathname();
  const { pendingBookings, count: pendingCount } = usePendingInvoices();
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isLite = process.env.NEXT_PUBLIC_LITE_MODE === 'true';

  const liteLinks = [
    { href: '/', label: 'Agenda', icon: Calendar },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/invoices', label: 'Factures', icon: FileText },
    { href: '/catalog/packages', label: 'Packs', icon: BarChart3 },
    { href: '/settings', label: 'Paramètres', icon: Settings },
  ];

  const fullLinks = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/bookings', label: 'Bookings', icon: Calendar },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/crm/prospection', label: 'Prospection', icon: Users },
    { href: '/crm', label: 'CRM', icon: BarChart3 },
    { href: '/scraping', label: 'Scraping', icon: Search },
    { href: '/instagram-inbox', label: 'Instagram', icon: Instagram },
    { href: '/invoices', label: 'Factures', icon: FileText },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/settings', label: 'Paramètres', icon: Settings },
  ];

  const navLinks = isLite ? liteLinks : fullLinks;
  const mobileLinks = isLite ? liteLinks : [fullLinks[0], fullLinks[1], fullLinks[2], fullLinks[4], fullLinks[9]];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/crm') return pathname === '/crm';
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-apple-border bg-apple-card/90 shadow-apple-sm backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-1.5 sm:px-3 lg:px-5">
        <div className="flex h-16 items-center justify-between">
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-brand-600" />
              <span className="hidden text-lg font-semibold tracking-tight text-apple-text-main 2xl:block">
                DJ Booker Pro
              </span>
            </Link>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`relative rounded-lg p-2 transition-colors ${
                  pendingCount > 0
                    ? 'text-brand-600 hover:bg-brand-50'
                    : 'text-apple-text-muted hover:bg-gray-50'
                }`}
                title={pendingCount > 0 ? `${pendingCount} facture(s) à créer` : 'Aucune notification'}
              >
                <Bell className="h-5 w-5" />
                {pendingCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-apple-border bg-apple-card shadow-apple-xl">
                  <div className="flex items-center justify-between border-b border-apple-border px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-apple-text-main">
                      <FileText className="h-4 w-4 text-brand-600" />
                      Factures à créer
                    </h3>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="rounded-lg p-1 transition-colors hover:bg-gray-50"
                    >
                      <X className="h-4 w-4 text-apple-text-muted" />
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {pendingBookings.length === 0 ? (
                      <div className="p-4 text-center text-apple-text-muted">
                        <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="text-sm">Toutes les factures sont à jour</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {pendingBookings.map(({ booking, daysSince }) => (
                          <Link
                            key={booking.id}
                            href={`/invoices?booking=${booking.id}`}
                            onClick={() => setShowNotifications(false)}
                            className="group flex items-start gap-3 p-3 transition-colors hover:bg-gray-50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-apple-text-main group-hover:text-brand-700">
                                {booking.displayName || booking.clientName || booking.title}
                              </p>
                              <p className="truncate text-sm text-apple-text-muted">{booking.title}</p>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs text-gray-400">
                                  {booking.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                </span>
                                {daysSince > 0 && (
                                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                                    daysSince > 7 ? 'border border-red-200/50 bg-red-50 text-red-700' : 'border border-orange-200/50 bg-orange-50 text-orange-700'
                                  }`}>
                                    il y a {daysSince}j
                                  </span>
                                )}
                                <span className="text-xs font-medium text-green-700">{booking.price}€</span>
                              </div>
                            </div>
                            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-brand-600" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {pendingBookings.length > 0 && (
                    <Link
                      href="/invoices"
                      onClick={() => setShowNotifications(false)}
                      className="block border-t border-apple-border px-4 py-3 text-center text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      Voir toutes les factures
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden items-center gap-1 2xl:flex">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border border-brand-100 bg-brand-50 text-brand-700'
                      : 'text-apple-text-muted hover:bg-gray-50 hover:text-apple-text-main'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-1 md:flex 2xl:hidden">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-apple-text-muted hover:bg-gray-50'
                  }`}
                  title={link.label}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            {mobileLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-apple-text-muted hover:bg-gray-50'
                  }`}
                  title={link.label}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
