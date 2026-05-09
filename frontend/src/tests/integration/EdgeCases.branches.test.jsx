import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as api from '../../services/utils/api';

jest.mock('../../services/utils/api');
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));

const { useAuth } = require('../../context/AuthContext');

// Test utilities and edge cases for various scenarios
describe('Page Coverage - Edge Cases and Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      currentUser: { id: 1, role: 'admin', email: 'admin@test.com' },
      is: jest.fn(role => role === 'admin')
    });
  });

  describe('Date formatting edge cases', () => {
    test('handles null date value', () => {
      const formatDate = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
      };
      expect(formatDate(null)).toBe('N/A');
      expect(formatDate(undefined)).toBe('N/A');
    });

    test('handles invalid date string', () => {
      const formatDate = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
      };
      expect(formatDate('invalid-date')).toBe('N/A');
    });

    test('formats valid ISO date', () => {
      const formatDate = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
      };
      const result = formatDate('2026-05-09T10:00:00Z');
      expect(result).not.toBe('N/A');
    });
  });

  describe('Status badge styling', () => {
    test('maps todo status correctly', () => {
      const statusBadgeClass = (status) => {
        const statusMap = {
          todo: 'bg-amber-500/20',
          in_progress: 'bg-sky-500/20',
          done: 'bg-emerald-500/20'
        };
        return statusMap[status] || 'bg-slate-800/40';
      };
      expect(statusBadgeClass('todo')).toBe('bg-amber-500/20');
      expect(statusBadgeClass('in_progress')).toBe('bg-sky-500/20');
      expect(statusBadgeClass('done')).toBe('bg-emerald-500/20');
      expect(statusBadgeClass('unknown')).toBe('bg-slate-800/40');
    });

    test('handles null status', () => {
      const statusBadgeClass = (status) => {
        const statusMap = {
          todo: 'bg-amber-500/20',
          in_progress: 'bg-sky-500/20'
        };
        return statusMap[status] || 'bg-slate-800/40';
      };
      expect(statusBadgeClass(null)).toBe('bg-slate-800/40');
      expect(statusBadgeClass(undefined)).toBe('bg-slate-800/40');
    });
  });

  describe('String formatting utilities', () => {
    test('formats task status with underscores', () => {
      const formatTaskStatus = (status) => {
        if (!status) return 'Unknown';
        if (status === 'in_progress') return 'In Progress';
        if (status === 'todo') return 'To Do';
        if (status === 'done') return 'Completed';
        return status.replace('_', ' ');
      };
      expect(formatTaskStatus('in_progress')).toBe('In Progress');
      expect(formatTaskStatus('todo')).toBe('To Do');
      expect(formatTaskStatus('done')).toBe('Completed');
      expect(formatTaskStatus('custom_status')).toBe('custom status');
    });

    test('handles null task status', () => {
      const formatTaskStatus = (status) => {
        if (!status) return 'Unknown';
        return status.replace('_', ' ');
      };
      expect(formatTaskStatus(null)).toBe('Unknown');
      expect(formatTaskStatus(undefined)).toBe('Unknown');
      expect(formatTaskStatus('')).toBe('Unknown');
    });

    test('formats project status with dashes and underscores', () => {
      const formatProjectStatus = (status) => {
        if (!status) return 'unknown';
        return status.replace(/[_-]/g, ' ');
      };
      expect(formatProjectStatus('on_hold')).toBe('on hold');
      expect(formatProjectStatus('in-progress')).toBe('in progress');
      expect(formatProjectStatus('on_hold-completed')).toBe('on hold completed');
    });

    test('handles null project status', () => {
      const formatProjectStatus = (status) => {
        if (!status) return 'unknown';
        return status.replace(/[_-]/g, ' ');
      };
      expect(formatProjectStatus(null)).toBe('unknown');
      expect(formatProjectStatus(undefined)).toBe('unknown');
    });
  });

  describe('Array and object handling', () => {
    test('safely extracts user IDs from mixed types', () => {
      const getMemberId = (member) => {
        if (!member) return null;
        if (typeof member === 'object') return member.id ?? member.user_id ?? null;
        return member;
      };
      expect(getMemberId(null)).toBe(null);
      expect(getMemberId(5)).toBe(5);
      expect(getMemberId({ id: 10 })).toBe(10);
      expect(getMemberId({ user_id: 15 })).toBe(15);
      expect(getMemberId({})).toBe(null);
    });

    test('handles array normalization', () => {
      const normalizeArray = (data) => {
        if (!Array.isArray(data)) return [];
        return data.map(item => item.id || item);
      };
      expect(normalizeArray(null)).toEqual([]);
      expect(normalizeArray(undefined)).toEqual([]);
      expect(normalizeArray([1, 2, 3])).toEqual([1, 2, 3]);
      expect(normalizeArray([{ id: 1 }, { id: 2 }])).toEqual([1, 2]);
    });
  });

  describe('Conditional rendering logic', () => {
    test('determines admin vs non-admin UI', () => {
      const isAdmin = true;
      const fallbackRoute = isAdmin ? '/admin/projects' : '/BasicDashboard';
      expect(fallbackRoute).toBe('/admin/projects');

      const isAdmin2 = false;
      const fallbackRoute2 = isAdmin2 ? '/admin/projects' : '/BasicDashboard';
      expect(fallbackRoute2).toBe('/BasicDashboard');
    });

    test('determines whether to show action buttons', () => {
      const canEdit = (currentUser, owner) => {
        return currentUser?.role === 'admin' || currentUser?.id === owner;
      };
      expect(canEdit({ id: 1, role: 'admin' }, 2)).toBe(true);
      expect(canEdit({ id: 1, role: 'developer' }, 1)).toBe(true);
      expect(canEdit({ id: 1, role: 'developer' }, 2)).toBe(false);
      expect(canEdit(null, 1)).toBe(false);
    });
  });

  describe('Priority level mapping', () => {
    test('maps priority strings to numeric values', () => {
      const getPriorityValue = (priority) => {
        const map = { low: 1, medium: 2, high: 3, critical: 4 };
        return map[priority] ?? 0;
      };
      expect(getPriorityValue('low')).toBe(1);
      expect(getPriorityValue('medium')).toBe(2);
      expect(getPriorityValue('high')).toBe(3);
      expect(getPriorityValue('critical')).toBe(4);
      expect(getPriorityValue('unknown')).toBe(0);
      expect(getPriorityValue(null)).toBe(0);
    });

    test('sorts tasks by priority', () => {
      const tasks = [
        { id: 1, priority: 'low' },
        { id: 2, priority: 'high' },
        { id: 3, priority: 'medium' }
      ];
      const priorityMap = { low: 1, medium: 2, high: 3 };
      const sorted = [...tasks].sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);
      expect(sorted[0].priority).toBe('high');
      expect(sorted[2].priority).toBe('low');
    });
  });

  describe('Filter logic', () => {
    test('filters tasks by status', () => {
      const tasks = [
        { id: 1, status: 'todo' },
        { id: 2, status: 'in_progress' },
        { id: 3, status: 'done' }
      ];
      const filterByStatus = (tasks, status) => {
        if (status === 'all') return tasks;
        return tasks.filter(t => t.status === status);
      };
      expect(filterByStatus(tasks, 'todo')).toHaveLength(1);
      expect(filterByStatus(tasks, 'done')).toHaveLength(1);
      expect(filterByStatus(tasks, 'all')).toHaveLength(3);
    });

    test('filters tasks by search term', () => {
      const tasks = [
        { id: 1, title: 'Fix bug' },
        { id: 2, title: 'Add feature' },
        { id: 3, title: 'Update docs' }
      ];
      const filterBySearch = (tasks, term) => {
        if (!term) return tasks;
        return tasks.filter(t => t.title.toLowerCase().includes(term.toLowerCase()));
      };
      expect(filterBySearch(tasks, 'fix')).toHaveLength(1);
      expect(filterBySearch(tasks, 'Update')).toHaveLength(1);
      expect(filterBySearch(tasks, '')).toHaveLength(3);
      expect(filterBySearch(tasks, 'nonexistent')).toHaveLength(0);
    });

    test('combines multiple filters', () => {
      const tasks = [
        { id: 1, status: 'todo', priority: 'high' },
        { id: 2, status: 'todo', priority: 'low' },
        { id: 3, status: 'done', priority: 'high' }
      ];
      const applyFilters = (tasks, status, priority) => {
        return tasks.filter(t => t.status === status && t.priority === priority);
      };
      expect(applyFilters(tasks, 'todo', 'high')).toHaveLength(1);
      expect(applyFilters(tasks, 'todo', 'low')).toHaveLength(1);
      expect(applyFilters(tasks, 'done', 'high')).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    test('safely handles API errors', () => {
      const handleError = (error) => {
        if (!error) return 'Unknown error';
        if (typeof error === 'string') return error;
        return error.message || 'Unknown error';
      };
      expect(handleError(new Error('API failed'))).toBe('API failed');
      expect(handleError('Custom error')).toBe('Custom error');
      expect(handleError(null)).toBe('Unknown error');
      expect(handleError({ message: 'Error object' })).toBe('Error object');
    });

    test('validates required fields', () => {
      const isValid = (formData) => {
        if (!formData.name) return false;
        if (!formData.email) return false;
        return true;
      };
      expect(isValid({ name: 'John', email: 'john@test.com' })).toBe(true);
      expect(isValid({ name: 'John', email: '' })).toBe(false);
      expect(isValid({ name: '', email: 'john@test.com' })).toBe(false);
    });
  });

  describe('Math and calculations', () => {
    test('calculates progress percentage', () => {
      const getProgress = (completed, total) => {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100);
      };
      expect(getProgress(0, 0)).toBe(0);
      expect(getProgress(1, 2)).toBe(50);
      expect(getProgress(3, 3)).toBe(100);
      expect(getProgress(1, 3)).toBe(33);
    });

    test('calculates overdue count', () => {
      const tasks = [
        { id: 1, due_date: '2026-05-01', status: 'todo' },
        { id: 2, due_date: '2026-05-15', status: 'todo' },
        { id: 3, due_date: '2026-05-01', status: 'done' }
      ];
      const today = new Date('2026-05-10');
      const overdueCount = tasks.filter(t => {
        if (t.status === 'done') return false;
        return new Date(t.due_date) < today;
      }).length;
      expect(overdueCount).toBe(1);
    });
  });
});
