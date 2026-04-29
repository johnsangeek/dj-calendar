'use client';

import { Instagram, Mail, Calendar, MoreHorizontal } from 'lucide-react';
import { Client } from '@/types';
import Link from 'next/link';

interface ModernClientCardProps {
  client: Client;
  onMenuClick?: () => void;
}

export const ModernClientCard = ({ client, onMenuClick }: ModernClientCardProps) => {
  return (
    <Link href={`/clients/${client.id}`}>
      <div className="group relative bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer">
        {/* Menu d'actions rapides discret au survol */}
        {onMenuClick && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenuClick();
            }}
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-50 rounded-md"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-400" />
          </button>
        )}

        <div className="flex items-start gap-4">
          {/* Avatar avec initiales et couleur personnalisée */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold text-white shadow-inner flex-shrink-0"
            style={{ backgroundColor: client.color || '#1A1A1E' }}
          >
            {client.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[#1A1A1E] text-lg leading-tight truncate">
              {client.professionalName || client.name}
            </h3>
            {client.professionalName && (
              <p className="text-[#6E6E73] text-sm mt-0.5 truncate">{client.name}</p>
            )}
          </div>
        </div>

        {/* Badges de statut - Couleurs désaturées type Apple */}
        {(client.igStatus || client.segmentation?.vip) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {client.igStatus && client.igStatus !== 'NOT_CONTACTED' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-purple-50 text-purple-600 border border-purple-100">
                <Instagram className="w-3 h-3" />
                {client.igStatus.replace(/_/g, ' ')}
              </span>
            )}
            {client.segmentation?.vip && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-50 text-amber-600 border border-amber-100">
                VIP
              </span>
            )}
          </div>
        )}

        {/* Divider subtil */}
        <div className="h-[1px] bg-[#F2F2F7] my-4" />

        {/* Stats rapides avec icônes discrètes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-[#6E6E73]">
            <Calendar className="w-4 h-4 opacity-60" />
            <span className="text-xs font-medium">{client.stats?.totalPrestations || 0} Bookings</span>
          </div>
          <div className="flex items-center gap-2 text-[#6E6E73]">
            <Mail className="w-4 h-4 opacity-60" />
            <span className="text-xs font-medium truncate">{client.primaryEmail || client.email || 'No email'}</span>
          </div>
        </div>

        {/* Indicateur de relance coloré */}
        {client.nextIgRelanceAt && client.igStatus === 'DM_SENT' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
            <div
              className={`w-2 h-2 rounded-full ${
                new Date(client.nextIgRelanceAt) < new Date() ? 'bg-red-500' : 'bg-gray-300'
              }`}
            />
            <span className="text-xs text-[#6E6E73]">
              {new Date(client.nextIgRelanceAt) < new Date()
                ? 'Relance en retard'
                : `Relance le ${new Date(client.nextIgRelanceAt).toLocaleDateString('fr-FR')}`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
};
