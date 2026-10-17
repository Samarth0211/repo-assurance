import { createInterface } from 'node:readline';

export interface SetupUI {
  write(text: string): void;
  ask(question: string): Promise<string>;
}

export class SetupCancelled extends Error {
  constructor() { super('Setup cancelled. No setup files were written.'); }
}

// Create the iterator immediately so redirected answers cannot be lost between prompts.
export function terminalUI(): SetupUI & { close(): void } {
  const input = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  const answers = input[Symbol.asyncIterator]();
  input.on('SIGINT', () => input.close());
  return {
    write: text => process.stdout.write(text),
    async ask(question) {
      process.stdout.write(question);
      const answer = await answers.next();
      if (answer.done) throw new SetupCancelled();
      return answer.value.trim();
    },
    close: () => input.close()
  };
}

export async function choose(ui: SetupUI, question: string, choices: string[], defaultIndex = 0): Promise<number> {
  ui.write(`\n${question}\n${choices.map((choice, i) => `  ${i + 1}) ${choice}`).join('\n')}\n`);
  while (true) {
    const answer = await ui.ask(`Choose [${defaultIndex + 1}]: `);
    if (!answer) return defaultIndex;
    if (/^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= choices.length) return Number(answer) - 1;
    ui.write(`Enter a number from 1 to ${choices.length}.\n`);
  }
}

export async function confirm(ui: SetupUI, question: string, defaultYes: boolean): Promise<boolean> {
  while (true) {
    const answer = (await ui.ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'}: `)).toLowerCase();
    if (!answer) return defaultYes;
    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    ui.write('Enter yes or no.\n');
  }
}

export function display(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
