import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

export function testApp() {
  render(<App />);
  expect(screen.getByText(/notes/i)).toBeInTheDocument();
}