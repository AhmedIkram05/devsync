import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminSystemSettings from '../../pages/AdminSystemSettings';
import { settingsService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  settingsService: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    runRetentionCleanup: jest.fn(),
  },
}));

describe('AdminSystemSettings', () => {
  beforeEach(() => {
    settingsService.getSettings.mockResolvedValue({
      default_user_role: 'team_lead',
      allow_self_registration: true,
      audit_log_retention_days: 14,
      auto_archive_completed_projects: false,
      project_retention_days: 90,
    });
    settingsService.updateSettings.mockResolvedValue({ success: true });
    settingsService.runRetentionCleanup.mockResolvedValue({
      result: {
        audit_logs_deleted: 11,
        projects_deleted: 2,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads settings, updates values, and saves changes', async () => {
    const { container } = render(<AdminSystemSettings />);

    expect(await screen.findByText('System Settings')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');

    fireEvent.change(selects[0], { target: { value: 'admin' } });
    fireEvent.change(selects[1], { target: { value: '30' } });
    fireEvent.change(selects[2], { target: { value: '365' } });

    const toggleButtons = container.querySelectorAll('button.relative.w-12.h-6.rounded-full');

    fireEvent.click(toggleButtons[0]);
    fireEvent.click(toggleButtons[1]);

    await waitFor(() => {
      expect(selects[0]).toHaveValue('admin');
      expect(selects[1]).toHaveValue('30');
      expect(selects[2]).toHaveValue('365');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(settingsService.updateSettings).toHaveBeenCalledWith({
        default_user_role: 'admin',
        allow_self_registration: false,
        audit_log_retention_days: 30,
        auto_archive_completed_projects: false,
        project_retention_days: 365,
      });
    });

    expect(await screen.findByText('Settings saved successfully')).toBeInTheDocument();
  });

  test('runs retention cleanup and reports deleted items', async () => {
    render(<AdminSystemSettings />);

    expect(await screen.findByText('System Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run retention now' }));

    await waitFor(() => {
      expect(settingsService.runRetentionCleanup).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Retention cleanup completed/i)).toBeInTheDocument();
    expect(screen.getByText(/11 audit logs and 2 projects/)).toBeInTheDocument();
  });

  test('shows a load error when settings cannot be fetched', async () => {
    settingsService.getSettings.mockRejectedValueOnce(new Error('offline'));

    render(<AdminSystemSettings />);

    expect(await screen.findByText('Failed to load settings')).toBeInTheDocument();
  });
});