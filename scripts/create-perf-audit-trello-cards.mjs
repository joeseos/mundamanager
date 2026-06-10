#!/usr/bin/env node
// Creates Trello cards for the tickets in docs/perf-audit-backlog.md on the
// "Munda Manager issue tracking" board (To Do list). Idempotent: cards whose
// title already exists on the board are skipped.
//
// Usage:
//   TRELLO_API_KEY=... TRELLO_TOKEN=... node scripts/create-perf-audit-trello-cards.mjs
//   node scripts/create-perf-audit-trello-cards.mjs --dry-run   # parse + plan only

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOARD_ID = '0Is9nPmc';
const LIST_NAME = 'To Do';
const DRY_RUN = process.argv.includes('--dry-run');

const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backlogPath = path.join(repoRoot, 'docs', 'perf-audit-backlog.md');

function parseTickets(markdown) {
  const tickets = [];
  const sections = markdown.split(/^---$/m);
  for (const section of sections) {
    const headingMatch = section.match(/^## Ticket \d+ — (.+)$/m);
    if (!headingMatch) continue;
    const title = headingMatch[1].trim();
    const body = section
      .slice(section.indexOf(headingMatch[0]) + headingMatch[0].length)
      .trim();
    const priorityMatch = body.match(/\*\*Priority:\s*(High|Medium|Low)/i);
    tickets.push({
      title,
      body,
      priority: priorityMatch ? priorityMatch[1] : null,
    });
  }
  return tickets;
}

async function trello(method, endpoint, params = {}) {
  const url = new URL(`https://api.trello.com/1${endpoint}`);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { method });
  if (!res.ok) {
    throw new Error(`Trello ${method} ${endpoint} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const tickets = parseTickets(await readFile(backlogPath, 'utf8'));
  if (tickets.length === 0) {
    throw new Error(`No tickets found in ${backlogPath}`);
  }
  console.log(`Parsed ${tickets.length} tickets from ${path.relative(repoRoot, backlogPath)}`);

  if (DRY_RUN) {
    for (const t of tickets) {
      console.log(`\n[dry-run] "${t.title}" (priority: ${t.priority ?? 'none'})`);
      console.log(t.body.split('\n').slice(0, 2).join('\n'));
    }
    return;
  }

  if (!API_KEY || !TOKEN) {
    throw new Error('TRELLO_API_KEY and TRELLO_TOKEN must be set');
  }

  const lists = await trello('GET', `/boards/${BOARD_ID}/lists`, { fields: 'name' });
  const todoList = lists.find((l) => l.name.trim().toLowerCase() === LIST_NAME.toLowerCase());
  if (!todoList) {
    throw new Error(
      `List "${LIST_NAME}" not found on board. Lists: ${lists.map((l) => l.name).join(', ')}`
    );
  }

  const labels = await trello('GET', `/boards/${BOARD_ID}/labels`, { fields: 'name,color' });
  const labelForPriority = (priority) => {
    if (!priority) return null;
    const p = priority.toLowerCase();
    return (
      labels.find((l) => l.name.trim().toLowerCase() === p) ??
      labels.find((l) => l.name.trim().toLowerCase() === `priority: ${p}`) ??
      null
    );
  };

  const existingCards = await trello('GET', `/boards/${BOARD_ID}/cards`, { fields: 'name,shortUrl' });
  const existingTitles = new Set(existingCards.map((c) => c.name.trim().toLowerCase()));

  const created = [];
  const skipped = [];
  for (const ticket of tickets) {
    if (existingTitles.has(ticket.title.toLowerCase())) {
      skipped.push(ticket.title);
      continue;
    }
    const label = labelForPriority(ticket.priority);
    const card = await trello('POST', '/cards', {
      idList: todoList.id,
      name: ticket.title,
      desc: ticket.body,
      pos: 'bottom',
      idLabels: label ? label.id : undefined,
    });
    created.push(card);
    console.log(`Created: ${ticket.title}\n  ${card.shortUrl}${label ? `  [label: ${label.name}]` : ''}`);
  }

  console.log(`\nDone. Created ${created.length}, skipped ${skipped.length} (already on board).`);
  for (const title of skipped) console.log(`  Skipped: ${title}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
