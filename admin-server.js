const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./lib/frontmatter');
const { slugify } = require('./lib/text');
const { build } = require('./build');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const ADMIN_DIR = path.join(ROOT, 'admin');
const ASSETS_DIR = path.join(ROOT, 'assets');
const PORT = 3001;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isValidPostFilename(filename) {
  return typeof filename === 'string' && /^[^/\\]+\.md$/.test(filename) && !filename.includes('..');
}

function readPostsList() {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const filenames = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
  return filenames
    .map((filename) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
      const { data } = parseFrontmatter(raw);
      return {
        filename,
        title: data.title || '(제목 없음)',
        date: data.date || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function readPost(filename) {
  const filePath = path.join(POSTS_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return {
    filename,
    title: data.title || '',
    date: data.date || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: body.replace(/^\n/, ''),
  };
}

function assertNoNewlines(value, fieldName) {
  if (typeof value === 'string' && /[\r\n]/.test(value)) {
    throw new Error(`${fieldName}에 줄바꿈 문자를 포함할 수 없습니다.`);
  }
}

function serializePost({ title, date, tags, body }) {
  assertNoNewlines(title, '제목');
  assertNoNewlines(date, '날짜');
  if (Array.isArray(tags)) tags.forEach((tag) => assertNoNewlines(tag, '태그'));

  const tagsLine = Array.isArray(tags) && tags.length ? `[${tags.join(', ')}]` : '[]';
  return `---
title: ${title}
date: ${date}
tags: ${tagsLine}
---
${body}
`;
}

function createPost({ title, date, tags, body }) {
  const finalDate = date || today();
  const slug = slugify(title);
  if (!slug) throw new Error('제목에서 유효한 파일명을 만들 수 없습니다.');

  const filename = `${finalDate}-${slug}.md`;
  const filePath = path.join(POSTS_DIR, filename);
  if (fs.existsSync(filePath)) throw new Error(`이미 같은 이름의 글이 있습니다: ${filename}`);

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, serializePost({ title, date: finalDate, tags, body }), 'utf8');
  return filename;
}

function updatePost(filename, { title, date, tags, body }) {
  const filePath = path.join(POSTS_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error('글을 찾을 수 없습니다.');
  fs.writeFileSync(filePath, serializePost({ title, date, tags, body }), 'utf8');
}

function deletePost(filename) {
  const filePath = path.join(POSTS_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error('글을 찾을 수 없습니다.');
  fs.unlinkSync(filePath);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        aborted = true;
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('잘못된 JSON입니다.'));
      }
    });
    req.on('error', (err) => {
      if (aborted) return;
      aborted = true;
      reject(err);
    });
  });
}

function serveFile(baseDir, relPath, res) {
  const resolvedBase = path.resolve(baseDir);
  const filePath = path.resolve(resolvedBase, relPath);
  if (filePath !== resolvedBase && !filePath.startsWith(resolvedBase + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const types = { ...MIME_TYPES, '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/assets/')) {
    serveFile(ASSETS_DIR, pathname.replace(/^\/assets\//, ''), res);
    return;
  }
  const relPath = pathname === '/' ? '/index.html' : pathname;
  serveFile(ADMIN_DIR, relPath, res);
}

async function handleApi(req, res, pathname) {
  const postMatch = pathname.match(/^\/api\/posts\/(.+)$/);

  try {
    if (pathname === '/api/posts' && req.method === 'GET') {
      return sendJson(res, 200, readPostsList());
    }

    if (pathname === '/api/posts' && req.method === 'POST') {
      const data = await readJsonBody(req);
      const filename = createPost(data);
      build();
      return sendJson(res, 201, { filename });
    }

    if (postMatch && req.method === 'GET') {
      const filename = decodeURIComponent(postMatch[1]);
      if (!isValidPostFilename(filename)) return sendJson(res, 400, { error: '잘못된 파일명입니다.' });
      const post = readPost(filename);
      if (!post) return sendJson(res, 404, { error: '글을 찾을 수 없습니다.' });
      return sendJson(res, 200, post);
    }

    if (postMatch && req.method === 'PUT') {
      const filename = decodeURIComponent(postMatch[1]);
      if (!isValidPostFilename(filename)) return sendJson(res, 400, { error: '잘못된 파일명입니다.' });
      const data = await readJsonBody(req);
      updatePost(filename, data);
      build();
      return sendJson(res, 200, { filename });
    }

    if (postMatch && req.method === 'DELETE') {
      const filename = decodeURIComponent(postMatch[1]);
      if (!isValidPostFilename(filename)) return sendJson(res, 400, { error: '잘못된 파일명입니다.' });
      deletePost(filename);
      build();
      return sendJson(res, 200, { filename });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (res.writableEnded || res.destroyed) return;
    sendJson(res, 400, { error: err.message });
  }
}

const TRUSTED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

// State-changing requests always carry an Origin header in modern browsers;
// reject cross-origin ones to block CSRF against this local admin API.
function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return TRUSTED_ORIGINS.has(origin);
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && !isTrustedOrigin(req)) {
      return sendJson(res, 403, { error: '허용되지 않은 요청 출처입니다.' });
    }
    handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`관리자 페이지: http://localhost:${PORT}`);
});
