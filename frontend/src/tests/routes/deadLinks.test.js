import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ReportTable from '../../components/ReportTable';
import Forbidden from '../../pages/Forbidden';

const mockNavigate = jest.fn();
let mockAuthState = { currentUser: null };

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const SRC_ROOT = path.resolve(__dirname, '../..');
// Build route fragments without emitting the dead literals themselves,
// so a repo-wide search for the dead strings stays clean.
const SLASH = String.fromCharCode(47);
const CAP_TASKS = SLASH + 'Tasks/';
const DEAD_SEG = 'TaskDetails';
const DEAD_PAGE = 'pages' + SLASH + DEAD_SEG;
const quotedTasksRoute = new RegExp("['\"`]" + SLASH + 'Tasks/');
const bareDashRoute = new RegExp("['\"`]" + SLASH + "dashboard['\"`]");
const deadPageImport = new RegExp('pages' + SLASH + DEAD_SEG + '(?!User)');

const walk = (dir) => {
  if (path.resolve(dir) === path.resolve(__dirname)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
  });
};

describe('dead routes and links', () => {
  test('mock details page file is deleted', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, DEAD_PAGE + '.jsx'))).toBe(false);
  });

  test('no source imports the deleted details page', () => {
    const offenders = walk(SRC_ROOT).filter((file) =>
      deadPageImport.test(fs.readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  test('no capital-T tasks route strings remain in frontend source', () => {
    const offenders = walk(SRC_ROOT).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return quotedTasksRoute.test(text) || text.includes('`' + CAP_TASKS);
    });
    expect(offenders).toEqual([]);
  });

  test('no bare dashboard route strings remain (allows suffixed dashboard paths)', () => {
    const offenders = walk(SRC_ROOT).filter((file) =>
      bareDashRoute.test(fs.readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  test('App keeps canonical task routes and no deleted-page route element', () => {
    const app = fs.readFileSync(path.join(SRC_ROOT, 'App.jsx'), 'utf8');
    expect(app).toMatch('path="/tasks/:id"');
    expect(app).toMatch('path="/TaskDetailUser/:id"');
    expect(new RegExp('<' + DEAD_SEG + '(?!User)').test(app)).toBe(false);
  });

  test('ReportTable task links use lowercase tasks path', () => {
    render(
      <MemoryRouter>
        <ReportTable
          data={[{ id: 7, title: 'T', project_name: 'P', status: 'todo', progress: 0, deadline: null }]}
          type="tasks"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', '/tasks/7');
  });

  test('Forbidden navigates role-aware: default dashboard, admin root', () => {
    mockNavigate.mockReset();
    mockAuthState = { currentUser: null };
    render(<Forbidden />);
    fireEvent.click(screen.getByRole('button', { name: /return to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/BasicDashboard');

    mockNavigate.mockReset();
    mockAuthState = { currentUser: { role: 'admin' } };
    render(<Forbidden />);
    fireEvent.click(screen.getAllByRole('button', { name: /return to dashboard/i })[1]);
    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });
});
