const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./lib/frontmatter');
const { renderMarkdown } = require('./lib/markdown');
const { renderTemplate } = require('./lib/render');
const { htmlToPlainText, makeExcerpt, slugify } = require('./lib/text');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const ASSETS_DIR = path.join(ROOT, 'assets');
const DIST_DIR = path.join(ROOT, 'docs');

function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleFromFilename(filename) {
  const withoutExt = filename.replace(/\.md$/, '');
  const withoutDate = withoutExt.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return withoutDate
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveDate(data, filename, mtime, warnings) {
  if (data.date) {
    const parsed = new Date(data.date);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    warnings.push(`"${filename}": frontmatter date "${data.date}" is invalid, falling back.`);
  }

  const filenameMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (filenameMatch) {
    const parsed = new Date(filenameMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  warnings.push(`"${filename}": no valid date found, using file modified time.`);
  return mtime;
}

function resolveSlug(data, filename) {
  if (data.slug) return slugify(data.slug);
  const withoutExt = filename.replace(/\.md$/, '');
  const withoutDate = withoutExt.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return slugify(withoutDate);
}

function formatDateDisplay(dateObj) {
  return dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateIso(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function renderTagsHtml(tags) {
  if (!tags.length) return '';
  return tags.map((tag) => `<span class="tag">${escapeHtmlAttr(tag)}</span>`).join(' ');
}

function loadPosts(warnings) {
  if (!fs.existsSync(POSTS_DIR)) {
    warnings.push(`No "posts/" directory found — creating an empty one.`);
    fs.mkdirSync(POSTS_DIR, { recursive: true });
    return [];
  }

  const filenames = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
  const posts = [];
  const seenSlugs = new Set();

  for (const filename of filenames) {
    const fullPath = path.join(POSTS_DIR, filename);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const { data, body } = parseFrontmatter(raw);

    const title = data.title || titleFromFilename(filename);
    const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [];
    const mtime = fs.statSync(fullPath).mtime;
    const dateObj = resolveDate(data, filename, mtime, warnings);
    const slug = resolveSlug(data, filename);

    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate slug "${slug}" from file "${filename}" — rename the file or set a unique "slug" in frontmatter.`);
    }
    seenSlugs.add(slug);

    const contentHtml = renderMarkdown(body);
    const plainText = htmlToPlainText(contentHtml);
    const excerpt = makeExcerpt(plainText, 160);

    posts.push({
      title,
      tags,
      dateObj,
      dateDisplay: formatDateDisplay(dateObj),
      dateIso: formatDateIso(dateObj),
      slug,
      url: `/posts/${slug}.html`,
      contentHtml,
      excerpt,
      searchContent: plainText.toLowerCase(),
    });
  }

  posts.sort((a, b) => b.dateObj - a.dateObj);
  return posts;
}

function copyAssets() {
  for (const sub of ['css', 'js', 'images']) {
    const src = path.join(ASSETS_DIR, sub);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(DIST_DIR, 'assets', sub);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, file), path.join(dest, file));
    }
  }
}

function build() {
  const warnings = [];

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_DIR, 'posts'), { recursive: true });

  const layoutTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'layout.html'), 'utf8');
  const postTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'post.html'), 'utf8');
  const indexTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'index.html'), 'utf8');
  const postCardTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'post-card.html'), 'utf8');

  const posts = loadPosts(warnings);

  // Individual post pages
  for (const post of posts) {
    const content = renderTemplate(postTemplate, {
      title: escapeHtmlAttr(post.title),
      dateIso: post.dateIso,
      dateDisplay: post.dateDisplay,
      tagsHtml: renderTagsHtml(post.tags),
      contentHtml: post.contentHtml,
    });
    const page = renderTemplate(layoutTemplate, {
      pageTitle: `${escapeHtmlAttr(post.title)} — My Blog`,
      content,
      extraScript: '',
    });
    fs.writeFileSync(path.join(DIST_DIR, 'posts', `${post.slug}.html`), page, 'utf8');
  }

  // Tag list + index page
  const allTags = [...new Set(posts.flatMap((post) => post.tags))].sort();
  const tagButtonsHtml = allTags
    .map((tag) => `    <button class="tag-btn" data-tag="${escapeHtmlAttr(tag)}" type="button">${escapeHtmlAttr(tag)}</button>`)
    .join('\n');

  const postListItems = posts
    .map((post) =>
      renderTemplate(postCardTemplate, {
        slug: post.slug,
        tagsAttr: post.tags.join(','),
        url: post.url,
        title: escapeHtmlAttr(post.title),
        dateIso: post.dateIso,
        dateDisplay: post.dateDisplay,
        tagsHtml: renderTagsHtml(post.tags),
        excerpt: escapeHtmlAttr(post.excerpt),
      })
    )
    .join('\n');

  const indexContent = renderTemplate(indexTemplate, { tagButtonsHtml, postListItems });
  const indexPage = renderTemplate(layoutTemplate, {
    pageTitle: 'My Blog',
    content: indexContent,
    extraScript: '<script src="/assets/js/search.js"></script>',
  });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexPage, 'utf8');

  // Search index
  const searchIndex = posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    url: post.url,
    date: post.dateIso,
    tags: post.tags,
    excerpt: post.excerpt,
    content: post.searchContent,
  }));
  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(searchIndex), 'utf8');

  copyAssets();

  console.log(`Built ${posts.length} post(s) into "${path.relative(ROOT, DIST_DIR)}/".`);
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

if (require.main === module) {
  build();
}

module.exports = { build };
