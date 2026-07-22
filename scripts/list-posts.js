const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

const POSTS_DIR = path.join(__dirname, '..', 'posts');

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.log('posts/ 폴더가 없습니다.');
    return;
  }

  const filenames = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
  if (filenames.length === 0) {
    console.log('아직 작성된 글이 없습니다. "node scripts/new-post.js"로 새 글을 만드세요.');
    return;
  }

  filenames.forEach((filename) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
    const { data } = parseFrontmatter(raw);
    const title = data.title || '(제목 없음)';
    const date = data.date || '(날짜 없음)';
    console.log(`${filename}\n  제목: ${title}\n  날짜: ${date}\n`);
  });
}

main();
