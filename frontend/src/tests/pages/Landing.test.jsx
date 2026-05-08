import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Landing from '../../pages/Landing';

const observers = [];

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observe = jest.fn();
    this.disconnect = jest.fn();
    observers.push(this);
  }

  trigger(entries) {
    this.callback(entries, this);
  }
}

describe('Landing', () => {
  beforeEach(() => {
    observers.length = 0;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.IntersectionObserver = MockIntersectionObserver;
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders the hero content and scrolls to sections from the side nav', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByText('Manage sprints. Link PRs. Ship together.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();

    const githubSection = document.getElementById('github');
    githubSection.scrollIntoView = jest.fn();

    fireEvent.click(screen.getByRole('link', { name: 'GitHub' }));

    expect(githubSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  test('updates the active section indicator when intersection changes', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    const observer = observers[0];
    const featuresSection = document.getElementById('features');

    act(() => {
      observer.trigger([
        {
          target: featuresSection,
          isIntersecting: true,
          intersectionRatio: 0.85,
        },
      ]);
    });

    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('aria-current', 'page');
  });
});