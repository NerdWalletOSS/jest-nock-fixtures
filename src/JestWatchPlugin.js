const { MODE, getMode, setMode } = require('./mode');
// import { Mode, recorder } from "./index";

const chalk = require("chalk");
const ansi = require("ansi-escapes");
const stripAnsi = require('strip-ansi');

console.log('JEST WATCH PLUGIN');

// function getMode() {
//   return process.env.JEST_NOCK_FIXTURES_MODE;
// }

// function setMode(mode) {
//   process.env.JEST_NOCK_FIXTURES_MODE = mode;
// }

const highlightMode = chalk.bgCyan.bold;

function getModeBanner({
  width = 23,
  title = `@nerdwallet/jest-nock-fixtures`,
  mode = getMode(),
  bannerColor = chalk.bgWhite.hex("#3d4852"),
  modeColor = highlightMode,
}) {
  const rows = [
    '',
    chalk.bold(title),
    '',
    mode,
  ].map(row => {
    const charDiff = row.length - stripAnsi(row).length;
    const rowWidth = width + charDiff;
    return row.padStart((rowWidth + row.length) / 2).padEnd(rowWidth)
  });

  return '\n' + [
    bannerColor(rows.slice(0, rows.length - 1).join('\n')),
    modeColor(rows.slice(rows.length - 1, rows.length).join('\n')),
  ].join('\n');
}


class JestNockFixturesWatchPlugin {
  changeMode() {
    // console.log('changeMode', getMode);
    switch (getMode()) {
      case MODE.DRYRUN:
        return setMode(MODE.LOCKDOWN);
      case MODE.LOCKDOWN:
        return setMode(MODE.RECORD);
      case MODE.RECORD:
        return setMode(MODE.WILD);
      case MODE.WILD:
        return setMode(MODE.DRYRUN);
    }
  }

  getUsageInfo(globalConfig) {
    return {
      key: "r",
      prompt: `change jest-nock-fixtures mode from "${highlightMode(getMode())}"`,
    };
  }

  // ! There seems to be a bug/race-condition where I cannot `await`
  // ! and _then_ set process.env.RECORDER
  async run() {
    this.changeMode();

    // Scroll up so that repeated presses of `r` don't spam the console
    // process.stdout.write(getModeBanner(50) + ansi.cursorUp(7));
    const banner = getModeBanner({ width: 36 });
    const lines = banner.split('\n').length;

    process.stdout.write(banner + ansi.cursorUp(lines - 1));

    // Set the mode for the next test worker's process
    // setMode(getMode());
    // process.env.RECORDER = recorder.getMode();
    // process.env.RECORDER = 'testGetMode';
  }
};

module.exports = JestNockFixturesWatchPlugin;