export const formatDate = (value, { fallback = 'N/A' } = {}) => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleDateString();
};

export const formatGithubDate = (dateString, fallback = 'Unknown') => {
  if (!dateString) {
    return fallback;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default formatDate;
