// Splits on top-level commas only, ignoring commas inside quoted items
// (e.g. `"news, tech", "daily"` stays two items, not three).
function splitArrayItems(inner) {
  const items = [];
  let current = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items;
}

function parseValue(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return splitArrayItems(inner).map((item) => stripQuotes(item.trim()));
  }
  return stripQuotes(trimmed);
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);

  if (lines[0].trim() !== '---') {
    return { data: {}, body: text };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    console.warn('Frontmatter opening "---" found but no closing "---" — treating whole file as body.');
    return { data: {}, body: text };
  }

  const data = {};
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim()) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    data[key] = parseValue(value);
  }

  const body = lines.slice(endIndex + 1).join('\n');
  return { data, body };
}

module.exports = { parseFrontmatter };
