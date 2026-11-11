import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => localStorage.clear());
afterEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('shows the setup screen for a fresh committee', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Set up your committee' })).toBeInTheDocument();
  });

  it('shows the projector view on #/projector', () => {
    window.location.hash = '#/projector';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Projector view' })).toBeInTheDocument();
  });
});
