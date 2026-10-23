# Compass

Five small everyday apps in one home-screen web app, with Claude built in. There are no accounts and no server. Everything is saved on the phone it's used on.

| App | What it does |
| --- | --- |
| 🍲 **Meals** | Plan breakfast, lunch and dinner for the week. Save recipes with their ingredients, then send a whole week's ingredients to the grocery list in one tap. |
| 🧺 **Chores** | Regular household jobs (daily, weekly, monthly…), grouped into Overdue, Today, This week and Later. Ticking off a repeating chore schedules the next one. |
| 💳 **Budget** | Log spending by category, set monthly limits, and see what's left this month. |
| 🌱 **Habits** | Daily check-ins with counters (e.g. 8 glasses of water), streaks and a 7-day history. |
| 🥫 **Pantry** | Keep track of what's in the fridge, freezer and pantry. Snap a photo and Claude updates the list, then suggests recipes from what you have. |

## ✨ Claude in Compass

Once connected, Claude works inside the apps, so there's no separate Claude app to open.

- **Ask Compass** (on the home screen) is a full chat with Claude: questions, advice, writing, ideas, web search, and photos (snap a receipt, a recipe or a handwritten list). It can also **act on the apps** when asked, e.g. "add milk and eggs to groceries", "plan dinners this week using my recipes", "I spent $40 at Target on household stuff", "mark laundry done", "start tracking water, 8 glasses a day", or "here's a photo of the fridge, what can I make?". Little green chips show what it changed.
- **✨ buttons in each app:**
  - Meals: fill the week's empty dinners, turn a recipe link, pasted text or dish name into a saved recipe, and sort the grocery list by store aisle.
  - Chores: suggest chores the home might be missing.
  - Budget: quick-add from plain words ("Target 42.10 household"), and a friendly summary of the month.
  - Habits: a short reflection on the last two weeks.
  - Pantry: photograph the fridge, freezer or pantry to update what you have, and get recipe ideas that use it up (one tap to plan it for tonight or add missing items to groceries).

### Setting it up (about 3 minutes, once)

1. Go to [console.anthropic.com](https://console.anthropic.com), sign in, and add a payment method under **Billing**. API use is billed separately from a Claude.ai subscription.
2. Recommended: under **Limits**, set a monthly spend limit (e.g. $10) so there are no surprises.
3. Create an API key under **API keys**.
4. On her phone, open Compass, tap **✨ Add Claude to Compass**, and paste the key. Compass checks the key before saving it.

**Cost:** Compass uses Claude Sonnet 5.5 at medium effort ($2 per million input tokens, $10 per million output tokens). A typical chat or ✨ button costs a cent or two. Long chats with lots of photos cost more, so tap ✎ to start a fresh chat for a new topic.

**Privacy and safety:**
- The key is stored only on her phone. It's never in this repo or in backup files.
- Anyone who can unlock her phone and open Compass can use the key. If the phone is lost, delete the key at console.anthropic.com.
- Her app data is sent to Claude only when she asks something or taps a ✨ button.
- If web search is turned off for your Anthropic organization, Compass notices and carries on without it.

## Putting it online (one time, about 2 minutes)

1. On GitHub, open this repo and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then click **Save**.
3. After a minute the site is live at `https://hecticmedic.github.io/Compass/`.

Note: GitHub Pages on a free account only works for **public** repos.

## Adding it to her phone

- **iPhone:** open the link in **Safari**, tap **Share**, then tap **Add to Home Screen**.
- **Android:** open the link in **Chrome**, tap the **⋮** menu, then tap **Add to Home screen** (or **Install app**).

After that it opens full-screen like a normal app and works offline.

## Good to know

- Data stays in that phone's browser. Use **Save backup** on the home screen now and then, and **Restore backup** to move everything to a new phone.
- On iPhone, use it from the home-screen icon rather than a Safari tab. Safari can clear data for websites that haven't been visited in a while, but home-screen apps are exempt.

## Making changes

It's plain HTML, CSS and JavaScript with no build step. Each app is one file (`meals/index.html` and so on), and shared styles and helpers live in `assets/`. The Claude features live in `assets/ai.js` (chat tools, prompts, and ✨ helpers) and `assistant/index.html` (the chat screen). The official Anthropic JavaScript SDK (`@anthropic-ai/sdk` 0.133.0) is bundled into `assets/vendor/anthropic-sdk.js`. When you change files, bump `VERSION` in `sw.js` so installed copies download the update.

## Updating Compass

Changes can be made by asking Claude Code in a session connected to this repo. Once they're pushed to `main`, GitHub Pages republishes the site in about a minute. The phone picks up the new version the next time Compass is opened (it may take a second open for the change to appear).
