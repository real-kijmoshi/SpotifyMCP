import readline from 'node:readline';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  under: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

const S = {
  check: `${c.green}\u2713${c.reset}`,
  cross: `${c.red}\u2717${c.reset}`,
  arrow: `${c.cyan}\u25b6${c.reset}`,
  dot: `${c.dim}\u2022${c.reset}`,
  line: `${c.dim}\u2500${c.reset}`,
  heavy: `${c.dim}\u2501${c.reset}`,
  bullet: `${c.gray}\u2022${c.reset}`,
};

function repeat(ch, n) { return ch.repeat(n); }
function line(n = 50) { return `${c.dim}${repeat('\u2500', n)}${c.reset}`; }
function hline(n = 50) { return `${c.dim}${repeat('\u2501', n)}${c.reset}`; }

function header(text) {
  const pad = Math.max(0, 50 - text.length - 4);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `\n${c.bold}${repeat('\u2501', left)}  ${text}  ${repeat('\u2501', right)}${c.reset}\n`;
}

function step(num, text) {
  const n = `${c.bold}${c.cyan}${String(num).padStart(2)}${c.reset}`;
  return `\n  ${S.arrow} ${n} ${c.bold}${text}${c.reset}`;
}

function success(text) {
  return `  ${S.check} ${c.green}${text}${c.reset}`;
}

function warn(text) {
  return `  ${S.arrow} ${c.yellow}${text}${c.reset}`;
}

function error(text) {
  return `  ${S.cross} ${c.red}${text}${c.reset}`;
}

function info(text) {
  return `  ${S.dot} ${c.dim}${text}${c.reset}`;
}

function highlight(text) {
  return `${c.bold}${c.white}${text}${c.reset}`;
}

function code(text) {
  return `${c.cyan}${text}${c.reset}`;
}

function muted(text) {
  return `${c.dim}${text}${c.reset}`;
}

function box(text, color = c.cyan) {
  const lines = text.split('\n');
  const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
  const top = `${color}${repeat('\u250d', maxLen + 4)}${c.reset}`;
  const bot = `${color}${repeat('\u250f', maxLen + 4)}${c.reset}`;
  const inner = lines.map(l => {
    const pad = maxLen - stripAnsi(l).length;
    return `  ${color}\u2502${c.reset} ${l}${repeat(' ', pad)} ${color}\u2502${c.reset}`;
  }).join('\n');
  return `\n${top}\n${inner}\n${bot}`;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function prompt(rl, question, defaultVal = '') {
  const formatted = defaultVal
    ? `${c.bold}${question}${c.reset}${c.dim} [${defaultVal}]${c.reset} `
    : `${c.bold}${question}${c.reset} `;
  return new Promise((resolve) => {
    rl.question(formatted, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function confirm(rl, question, defaultVal = true) {
  const hint = defaultVal ? 'Y/n' : 'y/N';
  const formatted = `${c.bold}${question}${c.reset} ${c.dim}${hint}${c.reset} `;
  return new Promise((resolve) => {
    rl.question(formatted, (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultVal);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

function spinner(text) {
  const frames = ['\u25ef', '\u25d4', '\u25d1', '\u25d5', '\u25d4', '\u25d1'];
  let i = 0;
  let running = true;
  let currentText = text;

  const interval = setInterval(() => {
    if (!running) return;
    process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]}${c.reset} ${currentText}  `);
    i++;
  }, 100);

  return {
    update(newText) { currentText = newText; },
    succeed(msg) {
      running = false;
      clearInterval(interval);
      process.stdout.write(`\r${' '.repeat(currentText.length + 10)}\r`);
      console.log(success(msg || currentText));
    },
    fail(msg) {
      running = false;
      clearInterval(interval);
      process.stdout.write(`\r${' '.repeat(currentText.length + 10)}\r`);
      console.log(error(msg || currentText));
    },
    stop() {
      running = false;
      clearInterval(interval);
      process.stdout.write(`\r${' '.repeat(currentText.length + 10)}\r`);
    },
  };
}

function config(obj, indent = 4) {
  const json = JSON.stringify(obj, null, 2);
  return json.split('\n').map(l => `${' '.repeat(indent)}${c.dim}${l}${c.reset}`).join('\n');
}

export {
  c, S, line, hline, header, step, success, warn, error, info,
  highlight, code, muted, box, prompt, confirm, spinner, config, stripAnsi,
};
