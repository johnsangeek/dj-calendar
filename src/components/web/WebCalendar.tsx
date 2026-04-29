'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Booking, Client } from '@/types';

interface WebCalendarProps {
  bookings: Booking[];
  clients: Client[];
  currentDate: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onDayClick: (day: number | null) => void;
  revenueForMonth: number;
}

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const WebCalendar = ({
  bookings,
  clients,
  currentDate,
  onPreviousMonth,
  onNextMonth,
  onDayClick,
  revenueForMonth,
}: WebCalendarProps) => {

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days: (number | null)[] = [];
    for (let i = 0; i < adjustedStartDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return day === today.getDate() &&
           currentDate.getMonth() === today.getMonth() &&
           currentDate.getFullYear() === today.getFullYear();
  };

  const getBookingsForDay = (day: number | null) => {
    if (!day) return null;
    const bookingsOnDay = bookings.filter(b => {
      const bookingDate = new Date(b.start);
      return bookingDate.getDate() === day &&
             bookingDate.getMonth() === currentDate.getMonth() &&
             bookingDate.getFullYear() === currentDate.getFullYear();
    });
    return bookingsOnDay.length > 0 ? bookingsOnDay : null;
  };

  const getClientColor = (clientId?: string) => {
    if (!clientId) return '#3B82F6';
    const client = clients.find((c) => c.id === clientId);
    return client?.color || '#3B82F6';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-[#F2F2F7] mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <p className="text-sm text-green-600 font-semibold mt-1">
            Revenus {monthNames[currentDate.getMonth()]} : {revenueForMonth.toLocaleString('fr-FR')}€
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPreviousMonth}
            className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="sticky top-16 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 border-b border-gray-200 shadow-md -mx-4 md:-mx-6 px-4 md:px-6">
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {dayNames.map((day) => (
            <div key={day} className="text-center font-semibold text-gray-700 text-xs md:text-sm py-2.5 md:py-3 leading-none">
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 mt-1.5">
        {getDaysInMonth(currentDate).map((day, index) => {
          const dayBookings = getBookingsForDay(day);
          const primaryClientColor = dayBookings && dayBookings.length > 0 ? getClientColor(dayBookings[0].clientId) : null;
          const hasMultipleBookings = dayBookings && dayBookings.length > 1;

          return (
            <div
              key={index}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-lg text-sm md:text-base p-1 relative
                ${day ? 'hover:scale-105 cursor-pointer touch-manipulation transition-transform' : ''}
                ${isToday(day) ? 'ring-2 ring-purple-600 ring-offset-2 font-bold' : ''}
                ${!day ? 'text-gray-300' : ''}
              `}
              style={primaryClientColor ? {
                backgroundColor: `${primaryClientColor}20`,
                border: `2px solid ${primaryClientColor}`,
              } : {}}
              onClick={() => onDayClick(day)}
            >
              <span className={`font-semibold ${isToday(day) ? 'text-purple-700' : 'text-gray-900'}`}>{day || ''}</span>
              {hasMultipleBookings && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white" title="Plusieurs réservations"></div>
              )}
              {dayBookings && dayBookings.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-1 w-full px-0.5">
                  {dayBookings.slice(0, 2).map((booking, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          booking.status === 'option' ? 'bg-yellow-400' :
                          booking.status === 'confirmé' ? 'bg-green-500' :
                          booking.status === 'terminé' ? 'bg-blue-500' :
                          booking.status === 'remplaçant' ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        title={booking.status}
                      />
                      <div
                        className="text-xs truncate px-1 rounded flex-1"
                        style={{
                          backgroundColor: getClientColor(booking.clientId),
                          color: 'white',
                          fontSize: '0.6rem',
                        }}
                        title={`${booking.displayName || booking.clientName} - ${booking.title} (${booking.status})`}
                      >
                        {booking.title || booking.displayName || booking.clientName || 'Booking'}
                      </div>
                    </div>
                  ))}
                  {dayBookings.length > 2 && (
                    <div className="text-xs text-gray-600 text-center">+{dayBookings.length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs md:text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-gray-600">Confirmé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
          <span className="text-gray-600">Option</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span className="text-gray-600">Remplaçant</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Terminé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-600">Annulé</span>
        </div>
      </div>
    </div>
  );
};
