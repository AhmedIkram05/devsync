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

    auditLogService.getLogById.mockImplementation((logId) => {
      if (logId === 2) {
        return Promise.resolve({
          id: 2,
          actor_name: 'Second Admin',
          actor_role: 'admin',
          action: 'role_updated',
          resource_type: 'user',
          resource_id: '8',
          ip: '127.0.0.2',
          user_agent: 'pytest',
          metadata: { before: 'developer', after: 'team_lead' },
          created_at: '2026-05-08T11:00:00.000Z',
        });
      }

      return Promise.resolve({
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

  test('supports fallback actor labels, pagination, and metadata details', async () => {
    auditLogService.getLogs.mockImplementation(({ page, action }) => {
      if (action) {
        return Promise.resolve({
          logs: [],
          total: 0,
          pages: 0,
          current_page: 1,
        });
      }

      if (page === 2) {
        return Promise.resolve({
          logs: [
            {
              id: 2,
              actor_name: 'Second Admin',
              actor_role: 'admin',
              action: 'role_updated',
              resource_type: 'user',
              resource_id: '8',
              metadata: { before: 'developer', after: 'team_lead' },
              created_at: '2026-05-08T11:00:00.000Z',
            },
          ],
          total: 2,
          pages: 2,
          current_page: 2,
        });
      }

      return Promise.resolve({
        logs: [
          {
            id: 1,
            actor_user_id: 7,
            actor_role: 'admin',
            action: 'user_deleted',
            resource_type: 'user',
            resource_id: '42',
            created_at: '2026-05-08T10:00:00.000Z',
          },
        ],
        total: 2,
        pages: 2,
        current_page: 1,
      });
    });

    render(<AdminAuditLogs />);

    expect(await screen.findByText('User 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(auditLogService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, per_page: 25 })
      );
    });

    expect(await screen.findByText('Second Admin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    await waitFor(() => {
      expect(auditLogService.getLogById).toHaveBeenCalledWith(2);
    });

    expect(await screen.findByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText(/"before": "developer"/)).toBeInTheDocument();
    expect(screen.getByText(/"after": "team_lead"/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filter by action...'), {
      target: { value: 'delete' },
    });

    await waitFor(() => {
      expect(auditLogService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete', page: 1, per_page: 25 })
      );
    });

    expect(await screen.findByText('No audit logs found.')).toBeInTheDocument();
  });
});
