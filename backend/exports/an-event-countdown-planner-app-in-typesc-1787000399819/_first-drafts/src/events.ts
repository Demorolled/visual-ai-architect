import { loadEvents, saveEvents } from '../storage.ts';

export interface Event {
  name: string;
  date: Date;
}

export function addEvent(name: string, date: string): void {
  const events = loadEvents();
  const newEvent: Event = {
    name,
    date: new Date(date),
  };
  events.push(newEvent);
  saveEvents(events);
}

export function listUpcomingEvents(): Event[] {
  const events = loadEvents();
  const now = new Date();
  return events.filter((e) => e.date > now);
}