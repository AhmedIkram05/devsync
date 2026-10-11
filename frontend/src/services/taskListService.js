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

// Data-fetch extracted from TaskList.jsx; render stays in the page.
const fetchTaskListLookups = async () => {
  const { userService, projectService } = getServices();
  const [usersData, projectsData] = await Promise.all([
    userService.getAllUsers().catch(() => []),
    projectService.getAllProjects().catch(() => []),
  ]);
  return {
    userMap: buildUserMap(usersData),
    projectMap: buildProjectMap(projectsData),
  };
};

const fetchTaskList = async (params = null) => {
  const { taskService } = getServices();
  const tasksData = await taskService.getAllTasks(params);
  return Array.isArray(tasksData) ? tasksData : [];
};

const taskListService = { fetchTaskList, fetchTaskListLookups };
export { fetchTaskList, fetchTaskListLookups, buildUserMap, buildProjectMap };
export default taskListService;
