export interface ContactItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
}

export type ContactTag = 'work' | 'personal' | 'friend' | 'family' | 'colleague';