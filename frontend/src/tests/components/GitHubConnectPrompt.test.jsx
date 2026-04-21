import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GitHubConnectPrompt from '../../components/GitHubConnectPrompt';
import { useAuth } from '../../context/AuthContext';

const mockHandleGithubPromptResponse = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('GitHubConnectPrompt component', () => {
  beforeEach(() => {
    mockHandleGithubPromptResponse.mockReset();
    useAuth.mockReturnValue({
      handleGithubPromptResponse: mockHandleGithubPromptResponse,
    });
  });

  test('renders prompt content and handles connect/skip actions', () => {
    render(<GitHubConnectPrompt />);

    expect(screen.getByText('Connect GitHub Account')).toBeInTheDocument();
    expect(screen.getByText(/Link tasks directly to GitHub issues/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Connect Now/i }));
    fireEvent.click(screen.getByRole('button', { name: /Skip For Now/i }));

    expect(mockHandleGithubPromptResponse).toHaveBeenNthCalledWith(1, true);
    expect(mockHandleGithubPromptResponse).toHaveBeenNthCalledWith(2, false);
  });
});
