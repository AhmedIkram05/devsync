import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminAuditLogs from '../../pages/AdminAuditLogs';
import { auditLogService } from '../../services/utils/api';

jest.mock('../../services/utils/api', () => ({
  auditLogService: {
    getLogs: jest.fn(),
    getLogById: jest.fn(),
  },
}));

describe('AdminAuditLogs', () => {
  beforeEach(() => {
    auditLogService.getLogs.mockResolvedValue({
      logs: [
        {
          id: 1,
          actor_user_id: 7,
          actor_name: 'Admin User',
          actor_role: 'admin',
          action: 'user_created',
          resource_type: 'user',
          resource_id: '42',
          created_at: '2026-05-08T10:00:00.000Z',
        },
      ],
      total: 1,
      pages: 1,
      current_page: 1,
    });

    auditLogService.getLogById.mockResolvedValue({
      id: 1,
      actor_user_id: 7,
      actor_name: 'Admin User',
      actor_role: 'admin',
      action: 'user_created',
      resource_type: 'user',
      resource_id: '42',
      ip: '127.0.0.1',
      user_agent: 'pytest',
      metadata: null,
      created_at: '2026-05-08T10:00:00.000Z',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders actor names instead of raw ids when available', async () => {
    render(<AdminAuditLogs />);

    expect(await screen.findByText('Admin User')).toBeInTheDocument();
    expect(screen.queryByText('User 7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    await waitFor(() => {
      expect(auditLogService.getLogById).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Audit Log Detail/i)).toBeInTheDocument();
    expect(screen.getAllByText('Admin User').length).toBeGreaterThan(0);
  });
});
