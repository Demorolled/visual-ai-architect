export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}