import '@testing-library/jest-dom';

const shouldIgnoreTestWarning = (args) => {
	const messages = args
		.filter((arg) => typeof arg === 'string')
		.join(' ');

	if (!messages) {
		return false;
	}

	if (messages.includes('ReactDOMTestUtils.act') && messages.includes('deprecated')) {
		return true;
	}

	if (messages.includes('React Router Future Flag Warning')) {
		return true;
	}

	return false;
};

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
	if (shouldIgnoreTestWarning(args)) {
		return;
	}

	originalConsoleError(...args);
};

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
	if (shouldIgnoreTestWarning(args)) {
		return;
	}

	originalConsoleWarn(...args);
};
