const fs = require('fs');
const path = require('path');
const { slugify } = require('../lib/text');

const POSTS_DIR = path.join(__dirname, '..', 'posts');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('사용법: node scripts/new-post.js "글 제목" [--tags 태그1,태그2]');
    process.exit(1);
  }

  const title = args[0];
  let tags = [];
  const tagsFlagIndex = args.indexOf('--tags');
  if (tagsFlagIndex !== -1 && args[tagsFlagIndex + 1]) {
    tags = args[tagsFlagIndex + 1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const date = today();
  const slug = slugify(title);
  if (!slug) {
    console.error('제목에서 유효한 파일명을 만들 수 없습니다. 다른 제목을 사용하세요.');
    process.exit(1);
  }

  fs.mkdirSync(POSTS_DIR, { recursive: true });

  const filename = `${date}-${slug}.md`;
  const filePath = path.join(POSTS_DIR, filename);

  if (fs.existsSync(filePath)) {
    console.error(`이미 같은 이름의 글이 있습니다: posts/${filename}`);
    process.exit(1);
  }

  const tagsLine = tags.length ? `[${tags.join(', ')}]` : '[]';
  const content = `---
title: ${title}
date: ${date}
tags: ${tagsLine}
---
여기에 본문을 마크다운으로 작성하세요.
`;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`새 글을 만들었습니다: posts/${filename}`);
  console.log('편집기로 내용을 채운 뒤 "node build.js"로 빌드하세요.');
}

main();
