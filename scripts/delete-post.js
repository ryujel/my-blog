const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'posts');

function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('사용법: node scripts/delete-post.js <파일명 또는 파일명 일부>');
    process.exit(1);
  }

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

  fs.unlinkSync(path.join(POSTS_DIR, matches[0]));
  console.log(`삭제했습니다: posts/${matches[0]}`);
  console.log('"node build.js"로 다시 빌드하세요.');
}

main();
