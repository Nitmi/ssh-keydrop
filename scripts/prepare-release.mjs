import { readFileSync, writeFileSync } from 'node:fs';

const repository = process.argv[2];
if (!repository || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(repository)) {
  console.error('Usage: npm run prepare:release -- https://github.com/OWNER/REPOSITORY');
  process.exit(1);
}
const url = repository.replace(/\/$/, '');
const readmeUrl = new URL('../README.md', import.meta.url);
let readme = readFileSync(readmeUrl, 'utf8');
readme = readme.replace(/<!-- deploy-button:start -->[\s\S]*?<!-- deploy-button:end -->/, `<!-- deploy-button:start -->\n[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(url)})\n<!-- deploy-button:end -->`);
readme = readme.replace(/<!-- release-note:start -->[\s\S]*?<!-- release-note:end -->\n?/, '');
writeFileSync(readmeUrl, readme);
const packageUrl = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(packageUrl, 'utf8'));
pkg.repository = { type: 'git', url: `${url}.git` };
writeFileSync(packageUrl, JSON.stringify(pkg, null, '\t') + '\n');
console.log('Release metadata updated. Review the diff and publish the public repository before using the button.');
