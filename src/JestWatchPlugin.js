const chalk = require('chalk');
const ansi = require('ansi-escapes');
const stripAnsi = require('strip-ansi');
const { MODES, getMode, setMode } = require('./mode');

const highlightMode = chalk.bgCyan.bold;

function getModeBanner({
  width = 23,
  title = `@nerdwallet/jest-nock-fixtures`,
  mode = getMode(),
  bannerColor = chalk.bgWhite.hex('#3d4852'),
  modeColor = highlightMode,
}) {
  const rows = ['', chalk.bold(title), '', mode].map(row => {
    const charDiff = row.length - stripAnsi(row).length;
    const rowWidth = width + charDiff;
    return row.padStart((rowWidth + row.length) / 2).padEnd(rowWidth);
  });

  return `\n${[
    bannerColor(rows.slice(0, rows.length - 1).join('\n')),
    modeColor(rows.slice(rows.length - 1, rows.length).join('\n')),
  ].join('\n')}`;
}

class JestNockFixturesWatchPlugin {
  // eslint-disable-next-line class-methods-use-this
  changeMode() {
    if (process.env.CI) {
      return setMode(MODES.LOCKDOWN);
    }
    switch (getMode()) {
      case MODES.LOCKDOWN:
        return setMode(MODES.RECORD);
      case MODES.RECORD:
        return setMode(MODES.WILD);
      case MODES.WILD:
        return setMode(MODES.DRYRUN);
      case MODES.DRYRUN:
      default:
        return setMode(MODES.LOCKDOWN);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  getUsageInfo() {
    return {
      key: 'r',
      prompt: `change jest-nock-fixtures mode from "${highlightMode(
        getMode()
      )}"`,
    };
  }

  // ! There seems to be a bug/race-condition where I cannot `await`
  // ! and _then_ set process.env.RECORDER
  async run() {
    this.changeMode();

    // Scroll up so that repeated presses of `r` don't spam the console
    const banner = getModeBanner({ width: 36 });
    const lines = banner.split('\n').length;

    process.stdout.write(banner + ansi.cursorUp(lines - 1));
  }
}

module.exports = JestNockFixturesWatchPlugin;
