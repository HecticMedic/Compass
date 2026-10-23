# Compass

Four small everyday apps in one home-screen web app. There are no accounts and no server, and no AI is involved. Everything is saved on the phone it's used on.

| App | What it does |
| --- | --- |
| 🍲 **Meals** | Plan breakfast, lunch and dinner for the week. Save recipes with their ingredients, then send a whole week's ingredients to the grocery list in one tap. |
| 🧺 **Chores** | Regular household jobs (daily, weekly, monthly…), grouped into Overdue, Today, This week and Later. Ticking off a repeating chore schedules the next one. |
| 💳 **Budget** | Log spending by category, set monthly limits, and see what's left this month. |
| 🌱 **Habits** | Daily check-ins with counters (e.g. 8 glasses of water), streaks and a 7-day history. |

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

It's plain HTML, CSS and JavaScript with no build step. Each app is one file (`meals/index.html` and so on), and shared styles and helpers live in `assets/`. When you change files, bump `VERSION` in `sw.js` so installed copies download the update.
