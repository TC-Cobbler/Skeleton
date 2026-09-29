#!/usr/bin/env node
// Phase 0 spike CLI: a thin wrapper over @skeleton/core.

const USAGE = `Usage: pnpm spike <command>

Commands:
  help    Show this message

Edit-op, parse and analyse commands are added as Phase 0 tasks land.`;

function main(argv: string[]): number {
  const [command] = argv;
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
