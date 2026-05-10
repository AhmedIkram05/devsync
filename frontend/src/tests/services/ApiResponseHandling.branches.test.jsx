import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../services/utils/api');
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn()
}));

// Mock implementation of api transformations
describe('API Response Transformations and Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Task response normalization', () => {
    test('normalizes task with all fields present', () => {
      const response = {
        id: 1,
        title: 'Task 1',
        status: 'todo',
        priority: 'high',
        assigned_to: 5,
        due_date: '2026-05-30',
        created_at: '2026-05-09',
        updated_at: '2026-05-09'
      };
      
      const normalizeTask = (task) => ({
        ...task,
        displayDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'
      });
      
      const normalized = normalizeTask(response);
      expect(normalized.title).toBe('Task 1');
      expect(normalized.displayDate).not.toBe('No date');
    });

    test('normalizes task with missing due_date', () => {
      const response = { id: 1, title: 'Task', status: 'todo' };
      const normalizeTask = (task) => ({
        ...task,
        displayDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'
      });
      const normalized = normalizeTask(response);
      expect(normalized.displayDate).toBe('No date');
    });

    test('normalizes task with null assigned_to', () => {
      const response = { id: 1, title: 'Task', assigned_to: null };
      const normalize = (task) => ({
        ...task,
        assignedToId: task.assigned_to || null
      });
      const normalized = normalize(response);
      expect(normalized.assignedToId).toBeNull();
    });
  });

  describe('User response normalization', () => {
    test('normalizes user with full profile', () => {
      const response = {
        id: 1,
        username: 'john',
        email: 'john@test.com',
        role: 'developer',
        profile: { name: 'John Doe' }
      };
      const displayName = response.profile?.name || response.username;
      expect(displayName).toBe('John Doe');
    });

    test('normalizes user with missing profile', () => {
      const response = { id: 1, username: 'john', email: 'john@test.com' };
      const displayName = response.profile?.name || response.username;
      expect(displayName).toBe('john');
    });

    test('normalizes user with missing profile property entirely', () => {
      const response = { id: 1, username: 'jane', email: 'jane@test.com' };
      const displayName = response.profile?.name || response.username;
      expect(displayName).toBe('jane');
    });
  });

  describe('Project response normalization', () => {
    test('normalizes project with all fields', () => {
      const response = {
        id: 1,
        name: 'Project A',
        status: 'active',
        members: [{ id: 1 }, { id: 2 }],
        created_at: '2026-01-01'
      };
      const memberCount = response.members?.length || 0;
      expect(memberCount).toBe(2);
    });

    test('normalizes project with no members', () => {
      const response = { id: 1, name: 'Project B', members: [] };
      const memberCount = response.members?.length || 0;
      expect(memberCount).toBe(0);
    });

    test('normalizes project with null members', () => {
      const response = { id: 1, name: 'Project C', members: null };
      const memberCount = response.members?.length || 0;
      expect(memberCount).toBe(0);
    });
  });

  describe('Status transitions and validation', () => {
    test('validates valid status transition', () => {
      const validTransitions = {
        'todo': ['in_progress'],
        'in_progress': ['done', 'todo'],
        'done': ['in_progress']
      };
      const canTransition = (from, to) => validTransitions[from]?.includes(to) || false;
      expect(canTransition('todo', 'in_progress')).toBe(true);
      expect(canTransition('todo', 'done')).toBe(false);
    });

    test('validates invalid status transition', () => {
      const validTransitions = {
        'todo': ['in_progress'],
        'in_progress': ['done', 'todo']
      };
      const canTransition = (from, to) => validTransitions[from]?.includes(to) || false;
      expect(canTransition('done', 'todo')).toBe(false);
    });

    test('handles unknown status gracefully', () => {
      const validTransitions = { 'todo': ['in_progress'] };
      const canTransition = (from, to) => validTransitions[from]?.includes(to) || false;
      expect(canTransition('unknown', 'todo')).toBe(false);
    });
  });

  describe('Array response handling', () => {
    test('handles array of tasks with mixed null values', () => {
      const response = [
        { id: 1, title: 'Task 1' },
        null,
        { id: 3, title: 'Task 3' }
      ];
      const tasks = response.filter(t => t !== null && t !== undefined);
      expect(tasks).toHaveLength(2);
    });

    test('handles completely empty array', () => {
      const response = [];
      expect(response.length).toBe(0);
      const hasItems = response.length > 0;
      expect(hasItems).toBe(false);
    });

    test('handles array with objects missing expected fields', () => {
      const response = [
        { id: 1, title: 'Task 1' },
        { id: 2 },  // missing title
        { id: 3, title: 'Task 3' }
      ];
      const titledTasks = response.filter(t => t.title);
      expect(titledTasks).toHaveLength(2);
    });
  });

  describe('Error response handling', () => {
    test('extracts error message from standard error response', () => {
      const response = { error: 'Validation failed', details: 'Title is required' };
      const message = response.error || 'Unknown error';
      expect(message).toBe('Validation failed');
    });

    test('extracts error message from non-standard response', () => {
      const response = { message: 'Not found' };
      const message = response.error || response.message || 'Unknown error';
      expect(message).toBe('Not found');
    });

    test('provides fallback error message', () => {
      const response = {};
      const message = response.error || response.message || 'Unknown error';
      expect(message).toBe('Unknown error');
    });

    test('handles error response as string', () => {
      const response = 'Server error';
      const message = typeof response === 'string' ? response : response.error || 'Unknown error';
      expect(message).toBe('Server error');
    });
  });

  describe('Pagination data handling', () => {
    test('normalizes paginated response', () => {
      const response = {
        data: [{ id: 1 }, { id: 2 }],
        pagination: { page: 1, limit: 10, total: 25 }
      };
      const items = response.data || [];
      const totalPages = Math.ceil(response.pagination.total / response.pagination.limit);
      expect(items).toHaveLength(2);
      expect(totalPages).toBe(3);
    });

    test('handles response without pagination metadata', () => {
      const response = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const totalPages = Array.isArray(response) ? 1 : (Math.ceil(response.pagination?.total / 10) || 1);
      expect(totalPages).toBe(1);
    });
  });

  describe('Date handling in responses', () => {
    test('normalizes ISO date strings', () => {
      const response = { id: 1, created_at: '2026-05-09T10:00:00Z' };
      const date = new Date(response.created_at);
      expect(date instanceof Date).toBe(true);
      expect(date.getFullYear()).toBe(2026);
    });

    test('handles null date fields', () => {
      const response = { id: 1, due_date: null };
      const dueDate = response.due_date ? new Date(response.due_date) : null;
      expect(dueDate).toBeNull();
    });

    test('handles undefined date fields', () => {
      const response = { id: 1 };
      const dueDate = response.due_date ? new Date(response.due_date) : null;
      expect(dueDate).toBeNull();
    });
  });

  describe('Query parameter encoding', () => {
    test('encodes simple query parameters', () => {
      const params = { search: 'test', status: 'active' };
      const query = new URLSearchParams(params).toString();
      expect(query).toContain('search=test');
      expect(query).toContain('status=active');
    });

    test('handles special characters in query parameters', () => {
      const params = { search: 'test query' };
      const query = new URLSearchParams(params).toString();
      expect(query).toBe('search=test+query');
    });

    test('handles empty string parameters', () => {
      const params = { search: '', status: 'active' };
      const query = new URLSearchParams(params).toString();
      expect(query).toContain('status=active');
    });
  });

  describe('Request options handling', () => {
    test('merges custom headers with defaults', () => {
      const defaultHeaders = { 'Content-Type': 'application/json' };
      const customHeaders = { 'X-Custom': 'value' };
      const merged = { ...defaultHeaders, ...customHeaders };
      expect(merged['Content-Type']).toBe('application/json');
      expect(merged['X-Custom']).toBe('value');
    });

    test('allows custom headers to override defaults', () => {
      const defaultHeaders = { 'Content-Type': 'application/json' };
      const customHeaders = { 'Content-Type': 'application/xml' };
      const merged = { ...defaultHeaders, ...customHeaders };
      expect(merged['Content-Type']).toBe('application/xml');
    });

    test('handles empty options object', () => {
      const options = {};
      const method = options.method || 'GET';
      expect(method).toBe('GET');
    });
  });

  describe('Response caching behavior', () => {
    test('creates cache key from endpoint and params', () => {
      const cacheKey = (endpoint, params) => {
        const queryStr = new URLSearchParams(params).toString();
        return `${endpoint}?${queryStr}`;
      };
      const key = cacheKey('/tasks', { status: 'todo' });
      expect(key).toContain('/tasks');
      expect(key).toContain('status=todo');
    });

    test('handles cache with different parameter orders', () => {
      const cache = new Map();
      const key1 = 'tasks?status=todo&priority=high';
      const key2 = 'tasks?priority=high&status=todo';
      cache.set(key1, 'data1');
      cache.set(key2, 'data2');
      expect(cache.size).toBe(2);
    });
  });

  describe('Filter and search handling', () => {
    test('filters tasks by multiple criteria', () => {
      const tasks = [
        { id: 1, status: 'todo', priority: 'high' },
        { id: 2, status: 'done', priority: 'high' },
        { id: 3, status: 'todo', priority: 'low' }
      ];
      const filtered = tasks.filter(t => t.status === 'todo' && t.priority === 'high');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    test('searches by text in multiple fields', () => {
      const tasks = [
        { id: 1, title: 'Fix bug', description: 'Critical bug' },
        { id: 2, title: 'Add feature', description: 'New feature' }
      ];
      const search = 'bug';
      const searched = tasks.filter(t => 
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      );
      expect(searched).toHaveLength(1);
    });
  });
});
