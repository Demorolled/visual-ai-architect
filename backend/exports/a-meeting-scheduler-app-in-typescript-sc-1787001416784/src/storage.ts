import { Meeting } from './scheduler';

export function loadMeetings(): Meeting[] {
  try {
    const data = require('../data/meetings.json');
    return data || [];
  } catch {
    return [];
  }
}

export function saveMeetings(meetings: Meeting[]): void {
  try {
    require('fs').writeFileSync('../data/meetings.json', JSON.stringify(meetings, null, 2));
  } catch (e) {
    console.error('Failed to save meetings:', e);
  }
}