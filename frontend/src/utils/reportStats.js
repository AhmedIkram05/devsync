// Derived statistics for the reports page (time buckets, task trends, summary
// snapshots). Extracted verbatim from Reports.jsx.

const buildTimeBuckets = (range) => {
  const now = new Date();
  const buckets = [];

  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 1);
      buckets.push({
        label: bucketStart.toLocaleDateString('en-US', { weekday: 'short' }),
        start: bucketStart,
        end: bucketEnd
      });
    }
    return buckets;
  }

  if (range === 'month') {
    const start = new Date(now);
    start.setDate(now.getDate() - 27);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i * 7);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 7);
      buckets.push({ label: `Week ${i + 1}`, start: bucketStart, end: bucketEnd });
    }
    return buckets;
  }

  const monthsToShow = range === 'quarter' ? 3 : 12;
  for (let i = 0; i < monthsToShow; i++) {
    const monthOffset = monthsToShow - 1 - i;
    const bucketStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const bucketEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1);
    buckets.push({
      label: bucketStart.toLocaleDateString('en-US', { month: 'short' }),
      start: bucketStart,
      end: bucketEnd
    });
  }

  return buckets;
};

const buildTaskTrend = (tasks, range) => {
  const buckets = buildTimeBuckets(range);
  const counts = buckets.map(() => 0);

  (tasks || []).forEach((task) => {
    if (!task?.created_at) return;
    const createdAt = new Date(task.created_at);
    if (Number.isNaN(createdAt.getTime())) return;
    buckets.forEach((bucket, index) => {
      if (createdAt >= bucket.start && createdAt < bucket.end) {
        counts[index] += 1;
      }
    });
  });

  return { labels: buckets.map((b) => b.label), counts };
};

const getGithubRepoMetrics = (repo) => {
  const openIssues = Number(repo?.open_issues ?? repo?.open_issues_count ?? 0) || 0;
  const totalPrs = Number(repo?.total_prs ?? 0) || 0;
  const recentCommits = Number(repo?.recent_commits ?? 0) || 0;
  return { openIssues, totalPrs, recentCommits, total: openIssues + totalPrs + recentCommits };
};

const getRepoLabel = (repo) => repo?.name || repo?.full_name || 'Repo';

const hasNonZero = (values = []) => values.some((v) => Number(v) > 0);

const buildSummarySnapshot = (type, summary, details) => {
  if (type === 'github') {
    const repos = Array.isArray(details) ? details : [];
    const openIssues = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).openIssues, 0);
    const totalPrs = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).totalPrs, 0);
    const recentCommits = repos.reduce((sum, repo) => sum + getGithubRepoMetrics(repo).recentCommits, 0);
    return {
      repos: summary?.repos ?? repos.length,
      open_issues: summary?.open_issues ?? openIssues,
      total_prs: summary?.total_prs ?? totalPrs,
      recent_commits: summary?.recent_commits ?? recentCommits
    };
  }

  if (type === 'developers') {
    return {
      team_members: summary?.team_members ?? summary?.developers ?? 0,
      avg_tasks: summary?.avg_tasks ?? 0,
      avg_completion: summary?.avg_completion ?? 0,
      active_devs: summary?.active_devs ?? 0
    };
  }

  // Prefer server-provided summary, but fall back to counting from details
  const tasks = Array.isArray(details) ? details : [];
  const statusCounts = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
  let overdueCount = 0;
  const normalize = (s) => (s === 'completed' ? 'done' : (s || '').toString());
  const now = new Date();

  tasks.forEach((task) => {
    const s = normalize(task?.status);
    if (statusCounts[s] !== undefined) {
      statusCounts[s] += 1;
    } else {
      // Unknown statuses are counted into backlog by default to avoid dropping data
      statusCounts.backlog += 1;
    }

    const deadlineVal = task?.deadline || task?.due_date || task?.dueAt || task?.due_at || null;
    if (deadlineVal) {
      const d = new Date(deadlineVal);
      if (!Number.isNaN(d.getTime()) && d < now && normalize(task?.status) !== 'done') {
        overdueCount += 1;
      }
    }
  });

  const totalFromDetails = tasks.length;
  return {
    total: summary?.total ?? totalFromDetails,
    backlog: summary?.backlog ?? statusCounts.backlog,
    todo: summary?.todo ?? statusCounts.todo,
    in_progress: summary?.in_progress ?? statusCounts.in_progress,
    review: summary?.review ?? statusCounts.review,
    done: summary?.done ?? statusCounts.done,
    completed: summary?.completed ?? (summary?.done ?? statusCounts.done),
    overdue: summary?.overdue ?? overdueCount
  };
};

export { buildTimeBuckets, buildTaskTrend, buildSummarySnapshot, getGithubRepoMetrics, getRepoLabel, hasNonZero };
