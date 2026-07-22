const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseFrontmatter } = require('../lib/frontmatter');

const POSTS_DIR = path.join(__dirname, '..', 'posts');

function findPost(query) {
  const filenames = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
  const matches = filenames.filter((name) => name.includes(query));

  if (matches.length === 0) {
    console.error(`"${query}"와 일치하는 글을 찾을 수 없습니다. "node scripts/list-posts.js"로 목록을 확인하세요.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `"${query}"와 일치하는 글이 여러 개입니다:\n${matches.map((m) => `  - ${m}`).join('\n')}\n더 구체적으로 입력하세요.`
    );
    process.exit(1);
  }
  return matches[0];
}

function parseFlags(args) {
  const flags = {};
  const flagNames = ['--title', '--tags', '--date'];
  for (const name of flagNames) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1]) {
      flags[name.slice(2)] = args[idx + 1];
    }
  }
  return flags;
}

function updateFrontmatter(filePath, flags) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);

  if (flags.title) data.title = flags.title;
  if (flags.date) data.date = flags.date;
  if (flags.tags !== undefined) {
    data.tags = flags.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const tagsLine = Array.isArray(data.tags) && data.tags.length ? `[${data.tags.join(', ')}]` : '[]';
  const content = `---
title: ${data.title || ''}
date: ${data.date || ''}
tags: ${tagsLine}
---
${body.replace(/^\n/, '')}`;

  fs.writeFileSync(filePath, content, 'utf8');
}

function openInEditor(filePath) {
  const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'nano');
  const result = spawnSync(editor, [filePath], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`에디터(${editor})를 실행할 수 없습니다: ${result.error.message}`);
    console.error(`직접 파일을 여세요: ${filePath}`);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('사용법: node scripts/edit-post.js <파일명 또는 파일명 일부> [--title 제목] [--tags 태그1,태그2] [--date YYYY-MM-DD]');
    console.error('플래그 없이 실행하면 시스템 기본 에디터로 파일을 엽니다.');
    process.exit(1);
  }

  const query = args[0];
  const filename = findPost(query);
  const filePath = path.join(POSTS_DIR, filename);
  const flags = parseFlags(args.slice(1));

  if (Object.keys(flags).length > 0) {
    updateFrontmatter(filePath, flags);
    console.log(`수정했습니다: posts/${filename}`);
  } else {
    openInEditor(filePath);
  }

  console.log('"node build.js"로 다시 빌드하세요.');
}

main();
