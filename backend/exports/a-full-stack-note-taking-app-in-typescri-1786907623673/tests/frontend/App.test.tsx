import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../client/src/App.tsx';

test('renders notes', () => {
  render(<App />);
  expect(screen.getByText(/Note 1/i)).toBeInTheDocument();
});