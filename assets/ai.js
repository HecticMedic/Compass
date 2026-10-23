// Claude inside Compass: the "Ask Compass" chat (which can read and change
// the apps' data through tools) and the ✨ helpers used by each app.
// Loaded on demand via getAI() in common.js, so Store, isoDate, etc. are globals.

import Anthropic from './vendor/anthropic-sdk.js';

const MODEL = 'claude-opus-5-5';
const BETAS = ['server-side-fallback-2026-07-01'];
const NO_WEB_KEY = 'compass-secret:noWebTools';

// ---- Key management ----

export function getKey() {
  try { return localStorage.getItem(AI_KEY) || ''; } catch { return ''; }
}

export function setKey(key) {
  if (key) localStorage.setItem(AI_KEY, key.trim());
  else localStorage.removeItem(AI_KEY);
}

function client() {
  const apiKey = getKey();
  if (!apiKey) throw friendly('Set up Claude first: open Ask Compass from the home screen.');
  // The key belongs to this household and stays on this device, so calling
  // the API straight from the browser is intended here.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

// Shared request settings. "default" fallbacks retry a safety decline on the
// model Anthropic recommends instead of failing outright.
const BASE = { model: MODEL, betas: BETAS, fallbacks: 'default' };

function friendly(message, cause) {
  const err = new Error(message, { cause });
  err.friendly = message;
  return err;
}

// Turns SDK errors into something a non-technical person can act on.
function explain(err) {
  if (err.friendly) return err;
  if (err instanceof Anthropic.APIUserAbortError) return friendly('Stopped.', err);
  if (err instanceof Anthropic.AuthenticationError) return friendly('Claude didn\'t accept that API key. Check that it was copied in full.', err);
  if (err instanceof Anthropic.PermissionDeniedError) return friendly('This API key isn\'t allowed to do that. Check the key\'s settings at console.anthropic.com.', err);
  if (err instanceof Anthropic.RateLimitError) return friendly('Claude is busy right now. Wait a minute and try again.', err);
  if (err instanceof Anthropic.BadRequestError) return friendly(`Claude couldn't take that request: ${err.error?.error?.message || err.message}`, err);
  if (err instanceof Anthropic.InternalServerError) return friendly('Claude is having trouble right now. Try again in a little while.', err);
  if (err instanceof Anthropic.APIConnectionError) return friendly('Couldn\'t reach Claude. Check the internet connection.', err);
  if (err instanceof Anthropic.APIError) return friendly(`Something went wrong talking to Claude (${err.status ?? 'error'}).`, err);
  return friendly('Something went wrong. Please try again.', err);
}

function textOf(message) {
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

function nowLine() {
  return 'Right now it is ' + new Date().toLocaleString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ` (${isoDate()}).`;
}

// ---- One-shot helpers for the ✨ buttons ----

// Asks for JSON matching `schema`. Server tools (e.g. web_fetch) may pause a
// long turn, so keep going until Claude finishes.
async function askJSON({ system, prompt, schema, tools, effort = 'low' }) {
  const c = client();
  const messages = [{ role: 'user', content: `${nowLine()}\n\n${prompt}` }];
  try {
    for (let i = 0; i < 5; i++) {
      const res = await c.beta.messages.create({
        ...BASE,
        max_tokens: 16000,
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        ...(tools ? { tools } : {}),
        messages,
      });
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      if (res.stop_reason === 'refusal') throw friendly('Claude couldn\'t help with that one.');
      if (res.stop_reason === 'max_tokens') throw friendly('That was too long for Claude to finish. Try something shorter.');
      return JSON.parse(textOf(res));
    }
    throw friendly('Claude took too long on that one. Please try again.');
  } catch (err) {
    throw explain(err);
  }
}

// Streams a short written answer into onText as it arrives.
async function streamText({ system, prompt, onText, effort = 'low' }) {
  try {
    const stream = client().beta.messages.stream({
      ...BASE,
      max_tokens: 16000,
      output_config: { effort },
      system,
      messages: [{ role: 'user', content: `${nowLine()}\n\n${prompt}` }],
    });
    stream.on('text', onText);
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw friendly('Claude couldn\'t help with that one.');
    return textOf(message);
  } catch (err) {
    throw explain(err);
  }
}

const HELPER_SYSTEM = 'You help one family run their household through an app called Compass. Be practical, warm and brief. Use everyday words.';

export async function suggestMeals({ slots, recipes, recent, wishes }) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['meals'],
    properties: {
      meals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'slot', 'meal'],
          properties: {
            date: { type: 'string', format: 'date' },
            slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
            meal: { type: 'string', description: 'Short meal name. Use a saved recipe name exactly when choosing one.' },
          },
        },
      },
    },
  };
  const out = await askJSON({
    system: HELPER_SYSTEM,
    schema,
    prompt: `Suggest a meal for each of these empty slots: ${JSON.stringify(slots)}.
Saved recipes (prefer these, spelled exactly, so their ingredients reach the grocery list): ${JSON.stringify(recipes)}.
Meals from the last couple of weeks (avoid repeating too often): ${JSON.stringify(recent)}.
${wishes ? `What they asked for: ${wishes}` : ''}
Mix in new ideas too. Keep weeknight dinners easy.`,
  });
  const wanted = new Set(slots.map(s => `${s.date}|${s.slot}`));
  return out.meals.filter(m => wanted.has(`${m.date}|${m.slot}`) && m.meal.trim());
}

export async function importRecipe(input) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'ingredients', 'notes'],
    properties: {
      name: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' }, description: 'Shopping-list style, e.g. "2 lb chicken thighs"' },
      notes: { type: 'string', description: 'Short summary of the steps, time and source link. Empty if nothing useful.' },
    },
  };
  const hasLink = /https?:\/\/\S+/.test(input);
  return askJSON({
    system: HELPER_SYSTEM,
    schema,
    tools: hasLink ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 }] : undefined,
    prompt: `Turn this into a saved recipe${hasLink ? ' (read the link first)' : ''}. If it's just a dish name, write a typical home version.\n\n${input}`,
  });
}

export async function sortGroceries(items) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['sections'],
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'items'],
          properties: {
            name: { type: 'string', description: 'Store section, e.g. "Produce", "Dairy & eggs"' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
  const out = await askJSON({
    system: HELPER_SYSTEM,
    schema,
    prompt: `Group this grocery list by supermarket section, in the order you'd walk a typical store. Copy each item exactly, once.\n${JSON.stringify(items)}`,
  });
  return out.sections;
}

export async function suggestChores(existing) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['chores'],
    properties: {
      chores: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'repeat'],
          properties: {
            name: { type: 'string' },
            repeat: { type: 'string', enum: ['day', '3day', 'week', '2week', 'month', '3month'] },
          },
        },
      },
    },
  };
  const out = await askJSON({
    system: HELPER_SYSTEM,
    schema,
    prompt: `Suggest 8 household chores this home is probably missing, with sensible repeat intervals. Things like changing filters or cleaning the oven count. They already have: ${JSON.stringify(existing)}.`,
  });
  return out.chores;
}

export async function parseExpense(text, categories) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['amount', 'category', 'note', 'date'],
    properties: {
      amount: { type: 'number' },
      category: { type: 'string', enum: categories.map(c => c.id) },
      note: { type: 'string', description: 'Short note, e.g. the store. Empty if none.' },
      date: { type: 'string', format: 'date' },
    },
  };
  return askJSON({
    system: HELPER_SYSTEM,
    schema,
    prompt: `Read this spending note and fill in the expense. Use today's date unless it says otherwise.
Categories: ${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name })))}
Note: ${text}`,
  });
}

export function budgetInsights(data, onText) {
  return streamText({
    system: HELPER_SYSTEM,
    onText,
    prompt: `Here is this household's spending. In 3-5 short bullet points, say how the month is going, what stands out, and one gentle, practical tip. No judgment. Plain text bullets starting with "• ", no headings.\n${JSON.stringify(data)}`,
  });
}

export function habitReflection(data, onText) {
  return streamText({
    system: HELPER_SYSTEM,
    onText,
    prompt: `Here are her habit check-ins for the last two weeks. Write a short, encouraging reflection: 3-4 bullet points starting with "• " covering what's going well, what slipped, and one small idea for next week. Warm, not cheesy. No headings.\n${JSON.stringify(data)}`,
  });
}

// ---- Ask Compass chat ----

const CHAT_SYSTEM = `You are Claude, built into Compass, a household app one family uses on their phone. You're talking with the person who runs it. Help with anything they ask, just as you would in the Claude app: questions, advice, ideas, writing, planning, recipes, research.

Compass has four tools you can read and change with your tools:
- Meals: a weekly plan (breakfast, lunch, dinner per date), saved recipes with ingredients, and a grocery list.
- Chores: household jobs with a repeat interval and next due date.
- Budget: expenses by category with monthly limits.
- Habits: daily habits with a target count per day and a log of check-ins.

How to work:
- When they ask you to add, plan, log or change something, do it with the tools straight away, then confirm in a sentence. Don't ask permission for routine changes. For anything that deletes or overwrites a lot, check first.
- Read the current data with get_compass_data before answering questions about it or before planning (e.g. check saved recipes before planning meals, and what's already on the grocery list).
- When planning meals from saved recipes, use the recipe name exactly so its ingredients can be added to groceries. Offer to add the ingredients.
- If they send a photo of a receipt, recipe or list, read it and offer to add it to the right app.
- Use web search for anything current or that you're unsure of.

Style: they're on a phone. Be warm, clear and brief. Use short paragraphs and simple lists. Avoid tables and long headings. Each message begins with the current date and time for your reference; don't repeat it back.`;

const SLOTS = ['breakfast', 'lunch', 'dinner'];
const REPEATS = ['none', 'day', '3day', 'week', '2week', 'month', '3month'];
const DATE = { type: 'string', description: 'YYYY-MM-DD' };

// Client tools. Each has an input schema, a run() that changes Store, and a
// short label for the chip shown in the chat.
const TOOLS = {
  get_compass_data: {
    description: 'Read the current data from one or more Compass apps.',
    input_schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: { type: 'string', enum: ['meal_plan', 'recipes', 'groceries', 'chores', 'budget', 'habits'] },
        },
      },
      required: ['sections'],
    },
    label: () => '👀 Looked at your Compass data',
    run({ sections }) {
      const today = isoDate();
      const out = {};
      for (const s of new Set(sections)) {
        if (s === 'meal_plan') {
          const plan = Store.get('meals:plan', {});
          out.meal_plan = Object.fromEntries(Object.entries(plan)
            .filter(([d]) => d >= addDays(today, -14) && d <= addDays(today, 28)).sort());
        } else if (s === 'recipes') {
          out.recipes = Store.get('meals:recipes', []).map(({ name, ingredients, notes }) => ({ name, ingredients, notes }));
        } else if (s === 'groceries') {
          out.groceries = Store.get('meals:groceries', []).map(g => ({ item: g.name, in_cart: g.done }));
        } else if (s === 'chores') {
          out.chores = Store.get('chores', []).map(({ name, repeat, due }) => ({ name, repeat, due }));
        } else if (s === 'budget') {
          const since = addDays(today, -62);
          out.budget = {
            currency: Store.get('budget:currency', 'USD'),
            categories: budgetCategories().map(({ id, name, budget }) => ({ id, name, monthly_limit: budget || null })),
            expenses_last_two_months: Store.get('budget:expenses', [])
              .filter(e => e.date >= since)
              .map(({ amount, cat, note, date }) => ({ amount, category: cat, note, date })),
          };
        } else if (s === 'habits') {
          const log = Store.get('habits:log', {});
          out.habits = Store.get('habits', []).map(h => ({
            name: h.name, target_per_day: h.target, unit: h.unit,
            last_14_days: Object.fromEntries(Array.from({ length: 14 }, (_, i) => addDays(today, -i))
              .map(d => [d, log[d]?.[h.id] || 0])),
          }));
        }
      }
      return out;
    },
  },

  add_grocery_items: {
    description: 'Add items to the grocery list. Skips items already on the list.',
    input_schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'string' } } },
      required: ['items'],
    },
    label: ({ items }) => `🛒 Added ${items.length} item${items.length === 1 ? '' : 's'} to groceries`,
    run({ items }) {
      const list = Store.get('meals:groceries', []);
      const have = new Set(list.filter(g => !g.done).map(g => g.name.toLowerCase()));
      const added = [];
      for (const raw of items) {
        const name = raw.trim();
        if (!name || have.has(name.toLowerCase())) continue;
        have.add(name.toLowerCase());
        list.push({ id: uid(), name, done: false });
        added.push(name);
      }
      Store.set('meals:groceries', list);
      return { added, skipped_already_on_list: items.length - added.length };
    },
  },

  update_grocery_items: {
    description: 'Mark grocery items as bought (in the cart) or remove them from the list. Names match case-insensitively.',
    input_schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' } },
        action: { type: 'string', enum: ['bought', 'remove'] },
      },
      required: ['items', 'action'],
    },
    label: ({ items, action }) => `🛒 ${action === 'bought' ? 'Checked off' : 'Removed'} ${items.length} grocery item${items.length === 1 ? '' : 's'}`,
    run({ items, action }) {
      let list = Store.get('meals:groceries', []);
      const wanted = new Set(items.map(i => i.trim().toLowerCase()));
      const matched = list.filter(g => wanted.has(g.name.toLowerCase()));
      if (action === 'bought') matched.forEach(g => { g.done = true; });
      else list = list.filter(g => !matched.includes(g));
      Store.set('meals:groceries', list);
      const found = new Set(matched.map(g => g.name.toLowerCase()));
      return { updated: matched.map(g => g.name), not_found: items.filter(i => !found.has(i.trim().toLowerCase())) };
    },
  },

  set_meals: {
    description: 'Put meals on the weekly plan. An empty meal clears that slot. Use saved recipe names exactly where they apply.',
    input_schema: {
      type: 'object',
      properties: {
        meals: {
          type: 'array',
          items: {
            type: 'object',
            properties: { date: DATE, slot: { type: 'string', enum: SLOTS }, meal: { type: 'string' } },
            required: ['date', 'slot', 'meal'],
          },
        },
      },
      required: ['meals'],
    },
    label: ({ meals }) => `🍲 Updated ${meals.length} meal${meals.length === 1 ? '' : 's'} on the plan`,
    run({ meals }) {
      const plan = Store.get('meals:plan', {});
      for (const { date, slot, meal } of meals) {
        if (!isISODate(date)) throw new Error(`Bad date: ${date}`);
        const value = meal.trim();
        plan[date] = { ...(plan[date] || {}), [slot]: value };
        if (!value) delete plan[date][slot];
        if (!Object.keys(plan[date]).length) delete plan[date];
      }
      Store.set('meals:plan', plan);
      return { ok: true };
    },
  },

  add_planned_ingredients_to_groceries: {
    description: 'Add the ingredients of every saved recipe planned between two dates to the grocery list.',
    input_schema: {
      type: 'object',
      properties: { from: DATE, to: DATE },
      required: ['from', 'to'],
    },
    label: () => '🛒 Added planned ingredients to groceries',
    run({ from, to }) {
      const plan = Store.get('meals:plan', {});
      const recipes = Store.get('meals:recipes', []);
      const ingredients = [];
      for (const [date, meals] of Object.entries(plan)) {
        if (date < from || date > to) continue;
        for (const meal of Object.values(meals)) {
          const r = recipes.find(x => x.name.toLowerCase() === meal.trim().toLowerCase());
          if (r) ingredients.push(...r.ingredients);
        }
      }
      return TOOLS.add_grocery_items.run({ items: ingredients });
    },
  },

  save_recipe: {
    description: 'Save a recipe (or replace one with the same name).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        ingredients: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['name', 'ingredients'],
    },
    label: ({ name }) => `📖 Saved recipe: ${name}`,
    run({ name, ingredients, notes = '' }) {
      const recipes = Store.get('meals:recipes', []);
      const clean = ingredients.map(s => s.trim()).filter(Boolean);
      const existing = recipes.find(r => r.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) Object.assign(existing, { ingredients: clean, notes });
      else recipes.push({ id: uid(), name: name.trim(), ingredients: clean, notes });
      Store.set('meals:recipes', recipes);
      return { ok: true, replaced: !!existing };
    },
  },

  add_chore: {
    description: 'Add a household chore.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        repeat: { type: 'string', enum: REPEATS, description: 'none = one-off' },
        due: DATE,
      },
      required: ['name', 'repeat', 'due'],
    },
    label: ({ name }) => `🧺 Added chore: ${name}`,
    run({ name, repeat, due }) {
      if (!isISODate(due)) throw new Error(`Bad date: ${due}`);
      const chores = Store.get('chores', []);
      chores.push({ id: uid(), name: name.trim(), repeat, due });
      Store.set('chores', chores);
      return { ok: true };
    },
  },

  update_chore: {
    description: 'Mark a chore done (repeating chores move to their next date, one-offs disappear), or delete it.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, action: { type: 'string', enum: ['done', 'delete'] } },
      required: ['name', 'action'],
    },
    label: ({ name, action }) => `🧺 ${action === 'done' ? 'Marked done' : 'Deleted'}: ${name}`,
    run({ name, action }) {
      let chores = Store.get('chores', []);
      const chore = findByName(chores, name);
      if (!chore) return { error: 'No chore by that name', chores: chores.map(c => c.name) };
      const today = isoDate();
      if (action === 'delete' || chore.repeat === 'none') chores = chores.filter(c => c !== chore);
      else chore.due = nextDue(chore.repeat, today > chore.due ? today : chore.due);
      Store.set('chores', chores);
      return { ok: true, next_due: action === 'done' && chore.repeat !== 'none' ? chore.due : null };
    },
  },

  add_expense: {
    description: 'Log spending in the budget.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        category: { type: 'string', description: 'Category id or name from get_compass_data budget' },
        note: { type: 'string' },
        date: DATE,
      },
      required: ['amount', 'category', 'date'],
    },
    label: ({ amount, note }) => `💳 Logged ${formatMoney(amount)}${note ? ` (${note})` : ''}`,
    run({ amount, category, note = '', date }) {
      if (!isISODate(date)) throw new Error(`Bad date: ${date}`);
      const value = Math.round(amount * 100) / 100;
      if (!(value > 0)) throw new Error('Amount must be more than 0');
      const cats = budgetCategories();
      const cat = cats.find(c => c.id === category) || findByName(cats, category) || cats.find(c => c.id === 'other') || cats[0];
      const expenses = Store.get('budget:expenses', []);
      expenses.push({ id: uid(), amount: value, cat: cat?.id || 'other', note: note.trim(), date, created: Date.now() });
      Store.set('budget:expenses', expenses);
      return { ok: true, category: cat?.name };
    },
  },

  log_habit: {
    description: 'Record a habit check-in. count is the total for that day (use the habit\'s target to mark it fully done, 0 to clear).',
    input_schema: {
      type: 'object',
      properties: { habit: { type: 'string' }, date: DATE, count: { type: 'integer' } },
      required: ['habit', 'date', 'count'],
    },
    label: ({ habit }) => `🌱 Checked in: ${habit}`,
    run({ habit, date, count }) {
      if (!isISODate(date)) throw new Error(`Bad date: ${date}`);
      const habits = Store.get('habits', []);
      const h = findByName(habits, habit);
      if (!h) return { error: 'No habit by that name', habits: habits.map(x => x.name) };
      const log = Store.get('habits:log', {});
      const n = Math.max(0, Math.min(99, count));
      log[date] = { ...(log[date] || {}), [h.id]: n };
      if (!n) delete log[date][h.id];
      if (!Object.keys(log[date]).length) delete log[date];
      Store.set('habits:log', log);
      return { ok: true, count: n, target: h.target };
    },
  },

  add_habit: {
    description: 'Start tracking a new daily habit.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        emoji: { type: 'string' },
        target: { type: 'integer', description: 'Times per day, usually 1' },
        unit: { type: 'string', description: 'What is counted, e.g. "glasses". Empty if target is 1.' },
      },
      required: ['name', 'emoji', 'target'],
    },
    label: ({ name }) => `🌱 New habit: ${name}`,
    run({ name, emoji, target, unit = '' }) {
      const habits = Store.get('habits', []);
      habits.push({ id: uid(), name: name.trim(), emoji: emoji || '⭐', target: Math.max(1, Math.min(99, target)), unit });
      Store.set('habits', habits);
      return { ok: true };
    },
  },
};

const BUDGET_DEFAULTS = [
  ['groceries', 'Groceries'], ['dining', 'Eating out'], ['home', 'Household'], ['transport', 'Transport'],
  ['bills', 'Bills'], ['personal', 'Personal'], ['kids', 'Gifts'], ['health', 'Health'], ['other', 'Other'],
];

// Budget categories live in Store once the Budget app has been opened; before
// that, the app's defaults apply.
function budgetCategories() {
  return Store.get('budget:categories', null) || BUDGET_DEFAULTS.map(([id, name]) => ({ id, name, budget: 0 }));
}

function findByName(list, name) {
  const n = name.trim().toLowerCase();
  return list.find(x => x.name.toLowerCase() === n) || list.find(x => x.name.toLowerCase().includes(n));
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s));
}

function formatMoney(n) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: Store.get('budget:currency', 'USD') }).format(n);
  } catch {
    return String(n);
  }
}

// Inputs stream eagerly, so the API doesn't validate them; check before running.
function validate(schema, value, path = 'input') {
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} must be an object`;
      for (const k of schema.required || []) if (!(k in value)) return `${path}.${k} is required`;
      for (const [k, v] of Object.entries(value)) {
        if (!schema.properties[k]) return `${path}.${k} is not a known field`;
        const e = validate(schema.properties[k], v, `${path}.${k}`);
        if (e) return e;
      }
      return null;
    }
    case 'array':
      if (!Array.isArray(value)) return `${path} must be a list`;
      for (let i = 0; i < value.length; i++) {
        const e = validate(schema.items, value[i], `${path}[${i}]`);
        if (e) return e;
      }
      return null;
    case 'string':
      if (typeof value !== 'string') return `${path} must be text`;
      if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.join(', ')}`;
      return null;
    case 'number':
      return typeof value === 'number' && isFinite(value) ? null : `${path} must be a number`;
    case 'integer':
      return Number.isInteger(value) ? null : `${path} must be a whole number`;
  }
  return null;
}

const CLIENT_TOOLS = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.input_schema,
  eager_input_streaming: true,
}));

const WEB_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
];

// Chip text for a tool call already in the history.
export function describeToolUse(block) {
  if (block.type === 'server_tool_use') {
    if (block.name === 'web_search') return `🔎 Searched the web${block.input?.query ? `: ${block.input.query}` : ''}`;
    if (block.name === 'web_fetch') return '🌐 Read a web page';
    return null;
  }
  const tool = TOOLS[block.name];
  if (!tool || validate(tool.input_schema, block.input)) return null;
  return tool.label(block.input);
}

// First text block of every user message, carrying the current date and time.
export function stampLine() {
  return `[${nowLine()}]`;
}

/**
 * Runs one chat turn: sends `history` (already ending with the new user
 * message), streams the reply, runs any tools, and appends every step to
 * `history` in place. Callbacks:
 *   onText(delta)    - reply text as it streams
 *   onStatus(label)  - e.g. "Searching the web…"
 *   onStep()         - a step finished and was appended to history
 */
export async function chat(history, { onText, onStatus, onStep, signal }) {
  const c = client();
  const startLength = history.length;
  let useWeb = localStorage.getItem(NO_WEB_KEY) !== '1';
  let jsonRetries = 0;

  try {
    for (let step = 0; step < 20; step++) {
      const params = {
        ...BASE,
        max_tokens: 64000,
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: CHAT_SYSTEM,
        tools: useWeb ? [...CLIENT_TOOLS, ...WEB_TOOLS] : CLIENT_TOOLS,
        messages: history,
      };

      let message;
      try {
        const stream = c.beta.messages.stream(params, { signal });
        stream.on('text', onText);
        stream.on('streamEvent', event => {
          if (event.type !== 'content_block_start') return;
          const b = event.content_block;
          if (b.type === 'server_tool_use') onStatus(b.name === 'web_fetch' ? 'Reading a web page…' : 'Searching the web…');
          else if (b.type === 'tool_use') onStatus('Updating Compass…');
          else if (b.type === 'thinking') onStatus('Thinking…');
        });
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Web search can be switched off for an organization in the Claude
        // Console. If a request with web tools is rejected, try once without
        // them, and remember that only if it then works.
        if (err instanceof Anthropic.BadRequestError && useWeb && step === 0) {
          useWeb = false;
          onStatus('Thinking…');
          continue;
        }
        // Anything else from the API is real. A tool input that couldn't be
        // parsed at all is retried a couple of times.
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        onStatus('Retrying…');
        continue;
      }

      if (!useWeb && localStorage.getItem(NO_WEB_KEY) !== '1') localStorage.setItem(NO_WEB_KEY, '1');

      if (message.stop_reason === 'refusal') {
        // Undo this turn so the declined request doesn't stay in the history.
        history.splice(startLength - 1);
        throw friendly('Claude can\'t help with that request. Try asking a different way.');
      }

      const toolUses = message.content.filter(b => b.type === 'tool_use');
      if (message.stop_reason === 'max_tokens' && toolUses.length) {
        throw friendly('That reply got too long. Try asking for something smaller.');
      }

      history.push({ role: 'assistant', content: message.content });
      onStep();

      if (message.stop_reason === 'pause_turn') continue;
      if (message.stop_reason !== 'tool_use' || !toolUses.length) return;

      const results = toolUses.map(block => {
        const tool = TOOLS[block.name];
        const problem = tool ? validate(tool.input_schema, block.input) : `Unknown tool ${block.name}`;
        if (problem) {
          return {
            type: 'tool_result', tool_use_id: block.id, is_error: true,
            content: `Invalid input (${problem}): ${JSON.stringify(block.input)}`,
          };
        }
        try {
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(tool.run(block.input)) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: String(err.message || err) };
        }
      });
      history.push({ role: 'user', content: results });
      onStep();
      onStatus('Thinking…');
    }
  } catch (err) {
    throw explain(err);
  }
}

// Shrinks a photo so it fits comfortably in a request and in saved history.
export async function photoBlock(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
}

// Checks a key with a tiny request before saving it.
export async function testKey(key) {
  const c = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true });
  try {
    await c.beta.messages.create({
      ...BASE,
      max_tokens: 64,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    });
  } catch (err) {
    throw explain(err);
  }
}
