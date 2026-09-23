import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar, ChevronUp, ChevronLeft, ChevronRight, Volume2, Bell, Plus, X, Trash2, Download } from 'lucide-react';
import { useKernel } from '../store/kernel';

/**
 * SystemTray - Bottom-right system tray with time, volume, and notifications
 * Enhanced calendar with notes, appointments, and reminders
 */

interface CalendarEvent {
    id: string;
    date: string; // YYYY-MM-DD
    title: string;
    time?: string;
    type: 'note' | 'appointment' | 'reminder';
    color?: string;
}

const useClickOutside = <T extends HTMLElement>(
    ref: React.RefObject<T | null>,
    handler: () => void
) => {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) {
                return;
            }
            handler();
        };
        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [ref, handler]);
};

// Load events from localStorage
const loadEvents = (): CalendarEvent[] => {
    try {
        const stored = localStorage.getItem('calendar-events');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

// Save events to localStorage
const saveEvents = (events: CalendarEvent[]) => {
    localStorage.setItem('calendar-events', JSON.stringify(events));
};

const SystemTray: React.FC = () => {
    const [time, setTime] = useState(new Date());
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isVolumeOpen, setIsVolumeOpen] = useState(false);
    const [volume, setVolume] = useState(50);

    // Calendar state
    const [viewDate, setViewDate] = useState(new Date()); // Month being viewed
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>(() => loadEvents());
    const [showAddEvent, setShowAddEvent] = useState(false);
    const [newEventTitle, setNewEventTitle] = useState('');
    const [newEventTime, setNewEventTime] = useState('');
    const [newEventType, setNewEventType] = useState<'note' | 'appointment' | 'reminder'>('note');

    const hasNewMessage = useKernel((state) => state.hasNewMessage);
    const setHasNewMessage = useKernel((state) => state.setHasNewMessage);

    const calendarRef = useRef<HTMLDivElement>(null);
    const volumeRef = useRef<HTMLDivElement>(null);

    const closeCalendar = useCallback(() => {
        setIsCalendarOpen(false);
        setSelectedDate(null);
        setShowAddEvent(false);
    }, []);
    const closeVolume = useCallback(() => setIsVolumeOpen(false), []);

    useClickOutside(calendarRef, closeCalendar);
    useClickOutside(volumeRef, closeVolume);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Save events whenever they change
    useEffect(() => {
        saveEvents(events);
    }, [events]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatShortDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    const formatFullDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Navigate months
    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const goToToday = () => {
        setViewDate(new Date());
    };

    // Calendar generation
    const generateCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (number | null)[] = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }
        return days;
    };

    // Get date string in YYYY-MM-DD format
    const getDateString = (day: number) => {
        const year = viewDate.getFullYear();
        const month = String(viewDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        return `${year}-${month}-${dayStr}`;
    };

    // Get events for a specific date
    const getEventsForDate = (dateStr: string) => {
        return events.filter(e => e.date === dateStr);
    };

    // Check if date has events
    const hasEvents = (day: number) => {
        const dateStr = getDateString(day);
        return events.some(e => e.date === dateStr);
    };

    // Add new event
    const addEvent = () => {
        if (!selectedDate || !newEventTitle.trim()) return;

        const newEvent: CalendarEvent = {
            id: Date.now().toString(),
            date: selectedDate,
            title: newEventTitle.trim(),
            time: newEventTime || undefined,
            type: newEventType,
            color: newEventType === 'appointment' ? '#8b5cf6' : newEventType === 'reminder' ? '#ef4444' : '#3b82f6',
        };

        setEvents([...events, newEvent]);
        setNewEventTitle('');
        setNewEventTime('');
        setShowAddEvent(false);
    };

    // Delete event
    const deleteEvent = (eventId: string) => {
        setEvents(events.filter(e => e.id !== eventId));
    };

    // Handle date click
    const handleDateClick = (day: number) => {
        const dateStr = getDateString(day);
        setSelectedDate(dateStr);
        setShowAddEvent(false);
    };

    const calendarDays = generateCalendar();
    const today = new Date();
    const isCurrentMonth = viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth();
    const currentDay = today.getDate();
    const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Selected date events
    const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];
    const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null;

    return (
        <div className="fixed top-2 right-4 z-50 flex items-center gap-1.5">
            {/* Install PWA Button */}
            <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-pwa-install'))}
                className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300 rounded-lg transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,255,255,0.15)] group"
                title="Install The Youniverse (Offline PWA)"
            >
                <Download size={13} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-[11px] font-medium tracking-wide">Install</span>
            </button>

            {/* Volume */}
            <div className="relative" ref={volumeRef}>
                <button
                    onClick={() => setIsVolumeOpen(!isVolumeOpen)}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                    title="Volume"
                >
                    <Volume2 size={16} className="text-white/70" />
                </button>
                <AnimatePresence>
                    {isVolumeOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full right-0 mt-2 p-3 bg-black/90 backdrop-blur-xl border border-white/20 rounded-lg shadow-xl"
                        >
                            <div className="flex items-center gap-2">
                                <Volume2 size={14} className="text-white/60" />
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={volume}
                                    onChange={(e) => setVolume(Number(e.target.value))}
                                    className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                                    title="Volume"
                                />
                                <span className="text-xs text-white/60 w-6">{volume}</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Notifications */}
            <button
                onClick={() => {
                    setHasNewMessage(false);
                    setIsCalendarOpen(true);
                }}
                className="p-2 hover:bg-white/10 rounded transition-colors relative"
                title="Notifications & Calendar"
            >
                <Bell size={16} className="text-white/70" />
                {(hasNewMessage || events.some(e => e.date === new Date().toISOString().split('T')[0])) && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
            </button>

            {/* Time & Date */}
            <div className="relative" ref={calendarRef}>
                <button
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded transition-colors"
                >
                    <div className="text-right">
                        <div className="text-xs font-medium text-white">{formatTime(time)}</div>
                        <div className="text-xs text-white/60">{formatShortDate(time)}</div>
                    </div>
                    <ChevronUp
                        size={12}
                        className={`text-white/40 transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                {/* Calendar Popup - TOP RIGHT */}
                <AnimatePresence>
                    {isCalendarOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            className="fixed top-4 right-4 w-80 bg-black/95 backdrop-blur-xl border border-white/20 rounded-lg shadow-2xl overflow-hidden"
                            style={{ zIndex: 9999 }}
                        >
                            {/* Header */}
                            <div className="p-4 border-b border-white/10 bg-linear-to-r from-purple-900/30 to-blue-900/30">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <Clock size={18} className="text-purple-400" />
                                        <span className="text-xl font-bold text-white">{formatTime(time)}</span>
                                    </div>
                                    <button
                                        onClick={() => setIsCalendarOpen(false)}
                                        className="p-1 hover:bg-white/10 rounded"
                                    >
                                        <X size={16} className="text-white/60" />
                                    </button>
                                </div>
                                <div className="text-sm text-white/60">{formatFullDate(time)}</div>
                            </div>

                            {/* Month Navigation */}
                            <div className="p-3 border-b border-white/10 flex items-center justify-between">
                                <button
                                    onClick={prevMonth}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                    <ChevronLeft size={18} className="text-white/70" />
                                </button>
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-purple-400" />
                                    <span className="text-sm font-semibold text-white">{monthName}</span>
                                </div>
                                <button
                                    onClick={nextMonth}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                    <ChevronRight size={18} className="text-white/70" />
                                </button>
                            </div>

                            {/* Go to Today */}
                            {!isCurrentMonth && (
                                <div className="px-3 py-1 border-b border-white/10">
                                    <button
                                        onClick={goToToday}
                                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                                    >
                                        Go to Today
                                    </button>
                                </div>
                            )}

                            {/* Calendar Grid */}
                            <div className="p-3">
                                {/* Day headers */}
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                                        <div key={day} className="text-center text-xs font-medium text-white/40 py-1">
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                {/* Days */}
                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map((day, index) => {
                                        const isToday = isCurrentMonth && day === currentDay;
                                        const dateStr = day ? getDateString(day) : '';
                                        const isSelected = dateStr === selectedDate;
                                        const dayHasEvents = day ? hasEvents(day) : false;

                                        return (
                                            <button
                                                key={index}
                                                onClick={() => day && handleDateClick(day)}
                                                disabled={day === null}
                                                className={`
                                                    aspect-square flex flex-col items-center justify-center text-xs rounded relative
                                                    ${day === null ? 'invisible' : 'cursor-pointer'}
                                                    ${isToday ? 'bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/30' : ''}
                                                    ${isSelected && !isToday ? 'bg-blue-500/50 text-white' : ''}
                                                    ${!isToday && !isSelected ? 'text-white/60 hover:bg-white/10' : ''}
                                                `}
                                            >
                                                {day}
                                                {dayHasEvents && (
                                                    <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-yellow-400" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Selected Date Events */}
                            {selectedDate && (
                                <div className="border-t border-white/10 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-white">
                                            {selectedDateObj?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </span>
                                        <button
                                            onClick={() => setShowAddEvent(true)}
                                            className="p-1 bg-purple-500/20 hover:bg-purple-500/40 rounded transition-colors"
                                        >
                                            <Plus size={14} className="text-purple-400" />
                                        </button>
                                    </div>

                                    {/* Event List */}
                                    {selectedDateEvents.length === 0 ? (
                                        <p className="text-xs text-white/40 text-center py-2">No events</p>
                                    ) : (
                                        <div className="space-y-1 max-h-24 overflow-y-auto">
                                            {selectedDateEvents.map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="flex items-center gap-2 p-2 bg-white/5 rounded text-xs group"
                                                >
                                                    <div
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: event.color }}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-white truncate">{event.title}</div>
                                                        {event.time && <div className="text-white/40">{event.time}</div>}
                                                    </div>
                                                    <button
                                                        onClick={() => deleteEvent(event.id)}
                                                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                                                    >
                                                        <Trash2 size={12} className="text-red-400" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add Event Form */}
                                    {showAddEvent && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="mt-2 p-2 bg-white/5 rounded border border-white/10"
                                        >
                                            <input
                                                type="text"
                                                placeholder="Event title..."
                                                value={newEventTitle}
                                                onChange={(e) => setNewEventTitle(e.target.value)}
                                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/40 mb-2"
                                                autoFocus
                                            />
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    type="time"
                                                    value={newEventTime}
                                                    onChange={(e) => setNewEventTime(e.target.value)}
                                                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                                                />
                                                <select
                                                    value={newEventType}
                                                    onChange={(e) => setNewEventType(e.target.value as any)}
                                                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                                                >
                                                    <option value="note">Note</option>
                                                    <option value="appointment">Appointment</option>
                                                    <option value="reminder">Reminder</option>
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={addEvent}
                                                    className="flex-1 bg-purple-500 hover:bg-purple-600 text-white text-xs py-1 rounded transition-colors"
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    onClick={() => setShowAddEvent(false)}
                                                    className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-1 rounded transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default SystemTray;
