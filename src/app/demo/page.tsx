'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Users, FileText, MessageSquare, TrendingUp, Euro, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

export default function DemoPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 13));
  
  const stats = [
    { label: 'Réservations ce mois', value: '8', icon: Calendar, color: 'bg-blue-500' },
    { label: 'Clients actifs', value: '24', icon: Users, color: 'bg-green-500' },
    { label: 'Factures en attente', value: '3', icon: FileText, color: 'bg-orange-500' },
    { label: 'Revenus ce mois', value: '4 200€', icon: Euro, color: 'bg-purple-500' },
  ];

  const quickActions = [
    { label: 'Nouvelle réservation', href: '/bookings', icon: Calendar, color: 'bg-blue-600' },
    { label: 'Ajouter un client', href: '/clients', icon: Users, color: 'bg-green-600' },
    { label: 'Créer une facture', href: '/invoices', icon: FileText, color: 'bg-orange-600' },
    { label: 'Envoyer un message', href: '/messages', icon: MessageSquare, color: 'bg-purple-600' },
  ];

  const upcomingBookings = [
    { id: 1, title: 'Mariage Sophie & Thomas', client: 'Sophie Martin', date: '15 Jan 2026', status: 'confirmé', price: 1200 },
    { id: 2, title: 'Soirée Entreprise ABC', client: 'ABC Corp', date: '18 Jan 2026', status: 'option', price: 800 },
    { id: 3, title: 'Anniversaire 30 ans', client: 'Marc Dupont', date: '22 Jan 2026', status: 'confirmé', price: 600 },
  ];

  const recentActivity = [
    { action: 'Nouvelle réservation créée', detail: 'Mariage Sophie & Thomas', time: 'Il y a 2h' },
    { action: 'Facture #2025-123 envoyée', detail: 'Client ABC Corp', time: 'Il y a 5h' },
    { action: 'Client ajouté', detail: 'Marc Dupont', time: 'Hier' },
    { action: 'Paiement reçu', detail: '800€ - Facture #2025-122', time: 'Il y a 2 jours' },
  ];

  // Données exemples pour le calendrier
  const bookingsInCalendar = [
    { day: 15, title: 'Mariage', status: 'confirmé' },
    { day: 18, title: 'Soirée Entreprise', status: 'option' },
    { day: 22, title: 'Anniversaire', status: 'confirmé' },
    { day: 28, title: 'Event Club', status: 'confirmé' },
  ];

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return day === today.getDate() && 
           currentDate.getMonth() === today.getMonth() && 
           currentDate.getFullYear() === today.getFullYear();
  };

  const hasBooking = (day: number | null) => {
    if (!day) return null;
    return bookingsInCalendar.find(b => b.day === day);
  };

  const statusColors = {
    'confirmé': 'bg-green-500',
    'option': 'bg-yellow-500',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
                <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  DJ Booker Pro - DÉMO
                </span>
              </div>
            </div>
            <div className="hidden md:flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                Retour
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Banner Démo */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="font-medium">
            🎯 Mode DÉMO - Données d'exemple pour découvrir l'application
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Tableau de bord (Démo)</h1>
          <p className="text-gray-600">Découvrez comment fonctionne DJ Booker Pro avec des données d'exemple</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className={`${stat.color} p-2 md:p-3 rounded-lg`}>
                  <stat.icon className="w-4 h-4 md:w-6 md:h-6 text-white" />
                </div>
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs md:text-sm text-gray-600">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Calendrier Mensuel avec événements */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100 mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={previousMonth}
                className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
              <button
                onClick={nextMonth}
                className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                aria-label="Mois suivant"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center font-semibold text-gray-700 text-xs md:text-sm py-2">
                {day}
              </div>
            ))}
            
            {getDaysInMonth(currentDate).map((day, index) => {
              const booking = hasBooking(day);
              return (
                <div
                  key={index}
                  className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg text-sm md:text-base p-1
                    ${day ? 'hover:bg-gray-100 cursor-pointer touch-manipulation' : ''}
                    ${isToday(day) ? 'bg-purple-600 text-white font-bold hover:bg-purple-700' : 'text-gray-900'}
                    ${!day ? 'text-gray-300' : ''}
                    ${booking ? 'border-2 border-blue-500' : ''}
                  `}
                >
                  <span className={isToday(day) ? 'text-white' : ''}>{day || ''}</span>
                  {booking && (
                    <div className={`w-2 h-2 rounded-full mt-1 ${statusColors[booking.status as keyof typeof statusColors]}`}></div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-600">Confirmé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-gray-600">Option</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100 mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`${action.color} text-white rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-opacity touch-manipulation min-h-[80px] md:min-h-0`}
              >
                <action.icon className="w-5 h-5" />
                <span className="font-medium text-sm md:text-base text-center md:text-left">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Grid Réservations & Activité */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prochaines réservations */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Prochaines réservations</h2>
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="bg-blue-100 p-2 rounded">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{booking.title}</p>
                    <p className="text-sm text-gray-600">{booking.client} • {booking.date}</p>
                    <p className="text-sm text-purple-600 font-medium">{booking.price}€</p>
                  </div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap ${
                    booking.status === 'confirmé' 
                      ? 'text-green-700 bg-green-100' 
                      : 'text-yellow-700 bg-yellow-100'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Activité récente */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Activité récente</h2>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.action}</p>
                      <p className="text-sm text-gray-600 truncate">{item.detail}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
