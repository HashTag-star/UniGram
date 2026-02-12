
import React, { useState, useMemo } from 'react';
import { MapPin, Users, Calendar, Plus, Filter, CheckCircle, TrendingUp } from 'lucide-react';
import { Event, EventCategory } from '../types';

interface EventsTabProps {
  events: Event[];
}

export const EventsTab: React.FC<EventsTabProps> = ({ events }) => {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'All'>('All');
  const [rsvpedEvents, setRsvpedEvents] = useState<Set<string>>(new Set());

  const categories: (EventCategory | 'All')[] = ['All', 'Social', 'Academic', 'Career', 'Sports', 'Workshop', 'Club'];

  const filteredEvents = useMemo(() => {
    return events.filter(e => selectedCategory === 'All' || e.category === selectedCategory);
  }, [events, selectedCategory]);

  const toggleRSVP = (eventId: string) => {
    setRsvpedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Campus Events</h1>
        <button className="flex items-center gap-2 bg-indigo-600 px-4 py-2 rounded-full text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-colors">
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {/* Categories Scroller */}
      <div className="flex gap-2 overflow-x-auto mb-8 no-scrollbar pb-2">
        {categories.map(cat => (
          <button 
            key={cat} 
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all border ${
              selectedCategory === cat 
                ? 'bg-indigo-600 border-indigo-600 text-white font-bold' 
                : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Promoted Events Hero Section (if any) */}
      {filteredEvents.some(e => e.isPromoted) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3 text-amber-400">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Promoted on Campus</span>
          </div>
          {filteredEvents.filter(e => e.isPromoted).map(event => (
            <div key={`hero-${event.id}`} className="relative h-64 rounded-3xl overflow-hidden group mb-4">
              <img src={event.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="px-2 py-0.5 bg-amber-500 text-black rounded text-[10px] font-black uppercase mb-2 inline-block">Featured</span>
                <h2 className="text-2xl font-bold text-white mb-2">{event.title}</h2>
                <div className="flex items-center gap-4 text-white/80 text-xs">
                   <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {event.date}</div>
                   <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest px-1">Discover</h3>
        {filteredEvents.map(event => (
          <div key={event.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden group transition-all hover:bg-white/[0.05] hover:border-white/20">
            <div className="flex flex-col sm:flex-row">
              <div className="sm:w-1/3 aspect-[4/3] sm:aspect-square relative overflow-hidden">
                <img src={event.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute top-3 left-3">
                  <span className="px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[9px] font-bold text-indigo-400 uppercase border border-white/10">
                    {event.category}
                  </span>
                </div>
              </div>
              
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors leading-tight">
                      {event.title}
                    </h2>
                  </div>
                  <p className="text-xs text-white/50 line-clamp-2 mb-4">{event.description}</p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/60">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px]">{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px] truncate">{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px]">{event.attendees + (rsvpedEvents.has(event.id) ? 1 : 0)} attending</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button 
                    onClick={() => toggleRSVP(event.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      rsvpedEvents.has(event.id) 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-white/10 text-white hover:bg-indigo-600'
                    }`}
                  >
                    {rsvpedEvents.has(event.id) ? <><CheckCircle className="w-3 h-3" /> RSVP'd</> : 'RSVP'}
                  </button>
                  <button className="p-2 bg-white/5 rounded-xl text-white/60 hover:text-white transition-colors">
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filteredEvents.length === 0 && (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
            <p className="text-white/40 italic">No events found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};
