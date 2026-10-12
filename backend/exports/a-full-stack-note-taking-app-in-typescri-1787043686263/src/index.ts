import express from 'express';
import { app } from '../api.ts';

export function start(): void {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}