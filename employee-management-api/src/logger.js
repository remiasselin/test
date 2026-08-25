'use strict';

const LEVELS = ['debug', 'info', 'warn', 'error'];

function timestamp() {
  return new Date().toISOString();
}

function make(level) {
  return (message, meta) => {
    const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
    const args = meta !== undefined ? [line, meta] : [line];
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else console.log(...args);
  };
}

const logger = {};
for (const level of LEVELS) logger[level] = make(level);

module.exports = logger;
