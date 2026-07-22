const fs = require('fs');
const path = require('path');
const { build } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(__dirname, '.auto-post-state.json');
const POSTS_DIR = path.join(ROOT, 'posts');
const MAX_PER_DAY = 3;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { date: todayStr(), count: 0 };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { date: todayStr(), count: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function main() {
  const today = todayStr();
  let state = loadState();

  if (state.date !== today) {
    state = { date: today, count: 0 };
  }

  if (state.count >= MAX_PER_DAY) {
    console.log(`[auto-post] 오늘(${today}) 이미 ${MAX_PER_DAY}개 올렸습니다. 건너뜁니다.`);
    return;
  }

  const index = state.count + 1;
  const now = new Date();
  const timeDisplay = now.toLocaleString('ko-KR');
  const slug = `auto-post-${index}`;
  const filename = `${today}-${slug}.md`;
  const filePath = path.join(POSTS_DIR, filename);

  fs.mkdirSync(POSTS_DIR, { recursive: true });

  const content = `---
title: 테스트 게시물 ${index} (${today})
date: ${today}
tags: [테스트, 자동생성]
---
이 글은 자동 예약 스크립트(\`scripts/auto-post.js\`)가 ${timeDisplay}에 자동으로 생성한 테스트 게시물입니다.

오늘 ${index}번째로 생성된 글입니다 (하루 최대 ${MAX_PER_DAY}개까지 생성됩니다).
`;

  fs.writeFileSync(filePath, content, 'utf8');

  state.count = index;
  saveState(state);

  build();

  console.log(`[auto-post] 글을 생성하고 빌드했습니다: posts/${filename} (오늘 ${index}/${MAX_PER_DAY})`);
}

main();
