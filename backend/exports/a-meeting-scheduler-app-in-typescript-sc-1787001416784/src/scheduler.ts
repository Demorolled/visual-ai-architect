export interface Meeting {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date;
}

let meetings: Meeting[] = [];

export function addMeeting(title: string, startTime: Date, endTime: Date): void {
  if (checkOverlap(startTime, endTime)) {
    console.error('Meeting overlaps with existing meetings.');
    return;
  }
  meetings.push({ id: Date.now(), title, startTime, endTime });
}

export function listMeetings(): Meeting[] {
  return meetings;
}

export function checkOverlap(startTime: Date, endTime: Date): boolean {
  for (const meeting of meetings) {
    if (startTime < meeting.endTime && endTime > meeting.startTime) {
      return true;
    }
  }
  return false;
}