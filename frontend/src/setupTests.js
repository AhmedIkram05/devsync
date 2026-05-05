import '@testing-library/jest-dom';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
	writable: true,
	value: jest.fn(() => ({
		canvas: document.createElement('canvas'),
		fillRect: jest.fn(),
		clearRect: jest.fn(),
		getImageData: jest.fn(() => ({ data: [] })),
		putImageData: jest.fn(),
		createImageData: jest.fn(),
		setTransform: jest.fn(),
		drawImage: jest.fn(),
		save: jest.fn(),
		restore: jest.fn(),
		beginPath: jest.fn(),
		moveTo: jest.fn(),
		lineTo: jest.fn(),
		closePath: jest.fn(),
		stroke: jest.fn(),
		translate: jest.fn(),
		scale: jest.fn(),
		rotate: jest.fn(),
		arc: jest.fn(),
		fill: jest.fn(),
		measureText: jest.fn(() => ({ width: 0 })),
		transform: jest.fn(),
		resetTransform: jest.fn(),
		rect: jest.fn(),
		clip: jest.fn(),
	})),
});

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
