import { Event, addEvent, listUpcomingEvents } from '../events.ts';

export function run(input: string): void {
  try {
    const events = input.split('\n').map((line) => {
      const [name, dateStr] = line.split(' ');
      const date = new Date(dateStr);
      return { name, date };
    });

    const now = new Date();
    const upcomingEvents = events.filter((event) => event.date > now);

    const sortedEvents = upcomingEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const event of sortedEvents) {
      const daysUntil = Math.floor((event.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`[${daysUntil} days] ${event.name}: ${event.date.toISOString()}`);
    }
  } catch (error) {
    console.error('Error processing events:', error);
  }
}

export function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node main.js <input>');
    return;
  }

  const input = args.join(' ');
  run(input);
}