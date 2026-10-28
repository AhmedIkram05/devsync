const normalizeList = (data, key) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
};

const buildUserMap = (users) => {
  const userById = {};
  normalizeList(users, 'users').forEach((user) => {
    userById[user.id] = user.name;
  });
  return userById;
};

const buildProjectMap = (projects) => {
  const projectById = {};
  normalizeList(projects, 'projects').forEach((project) => {
    projectById[project.id] = project.name;
  });
  return projectById;
};

// Lazy require keeps existing jest.mock('../../services/utils/api') tests working:
// the mocked module object (including per-test property assignment) is read at
// call time, not import time.
const getServices = () => {
  // eslint-disable-next-line global-require
  const utilsApi = require('./utils/api');
  return {
    taskService: utilsApi.taskService,
    userService: utilsApi.userService,
    projectService: utilsApi.projectService,
  };
};

// Backend list endpoints cap per_page at 100 (query_params.MAX_PER_PAGE), so a
// single unpaginated call silently drops everything past the first page —
// assignee/project filters were incomplete beyond 100. Page until short.
const LOOKUP_PAGE_SIZE = 100;
const MAX_LOOKUP_PAGES = 50; // 50 * 100 entries; guards against a looping backend

const fetchAllLookupPages = async (fetchPage, key) => {
  const all = [];
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const items = normalizeList(await fetchPage(page), key);
    all.push(...items);
    if (items.length < LOOKUP_PAGE_SIZE) {
      break;
    }
  }
  return all;
};

// Data-fetch extracted from TaskList.jsx; render stays in the page.
const fetchTaskListLookups = async () => {
  const { userService, projectService } = getServices();
  const [users, projects] = await Promise.all([
    fetchAllLookupPages(
      (page) => userService.getAllUsers(`?page=${page}&per_page=${LOOKUP_PAGE_SIZE}`).catch(() => []),
      'users'
    ),
    fetchAllLookupPages(
      (page) => projectService.getAllProjects({ page, per_page: LOOKUP_PAGE_SIZE }).catch(() => []),
      'projects'
    ),
  ]);
  return {
    userMap: buildUserMap(users),
    projectMap: buildProjectMap(projects),
  };
};

// Pagination-aware fetch: returns { items, pagination } for the current page.
const fetchTaskListPage = async (params = null) => {
  const { taskService } = getServices();
  const result = await taskService.getTasksPaginated(params);
  const items = Array.isArray(result?.items) ? result.items : [];
  return { items, pagination: result?.pagination ?? null };
};

// Back-compat array-returning wrapper.
const fetchTaskList = async (params = null) => {
  const { items } = await fetchTaskListPage(params);
  return items;
};

const taskListService = { fetchTaskList, fetchTaskListPage, fetchTaskListLookups };
export { fetchTaskList, fetchTaskListPage, fetchTaskListLookups, buildUserMap, buildProjectMap };
export default taskListService;
