import { Event } from '../events/events.ts';

export async function loadEvents(): Promise<Event[]> {
  const path = '/path/to/events.json';
  const response = await fetch(`file://${path}`);
  if (response.status !== 200) {
    throw new Error(`Failed to load events from ${path}`);
  }
  return response.json();
}

export async function saveEvents(events: Event[]): Promise<void> {
  const path = '/path/to/events.json';
  const response = await fetch(`file://${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  });
  if (response.status !== 200) {
    throw new Error(`Failed to save events to ${path}`);
  }
}