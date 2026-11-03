import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import Game from './Game';

// The README doubles as the project's open-source page on handheld devices.
// It is rendered to HTML at build time, so the static export stays in sync with the repo.
const readmeHtml = marked.parse(readFileSync(join(process.cwd(), 'README.md'), 'utf8'));

export default function Home() {
  return <Game readmeHtml={readmeHtml} />;
}
