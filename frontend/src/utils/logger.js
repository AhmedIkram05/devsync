const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args) => {
    if (isDev) {
      console.log(...args);
    }
  },
  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },
  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  debug: (...args) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  error: (...args) => {
    console.error(...args);
  },
};

export default logger;
