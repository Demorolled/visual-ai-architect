import App from './App';
import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@testing-library/react');

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });
});