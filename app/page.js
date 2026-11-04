import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import Game from './Game';

// The README doubles as the project's open-source page on handheld devices.
// It is rendered to HTML at build time, so the static export stays in sync with the repo.
// Screenshots live in public/ (so they show on GitHub too); point them at the site's base path here.
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const readmeHtml = marked
  .parse(readFileSync(join(process.cwd(), 'README.md'), 'utf8'))
  .replace(/src="public\//g, `src="${base}/`);

export default function Home() {
  return <Game readmeHtml={readmeHtml} />;
}
