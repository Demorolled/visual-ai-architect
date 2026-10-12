import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders notes', async () => {
  render(<App />);
  const notes = await screen.findAllByText(/Note/);
  expect(notes.length).toBeGreaterThan(0);
});