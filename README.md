# Deacon Plate

An agent for Wake Forest students that answers three questions: where should I eat right now, what should I get, and how does it fit my day. Built by Marco Favuzza for FYS: Fintech and Big Data (Professor Macosko), with Claude.

## What it does

- Reads today's menus and nutrition for the Pit, North Dining Hall, Zick's, La Sabrosa and Shorty's from dining.wfu.edu, plus a fixed Chick-fil-A menu.
- Picks the best place that is open and builds a plate that fits your calorie and protein goals.
- Tracks what you eat and your workouts, and adjusts the next meal.
- Chat: type "had the chicken teriyaki at North" or "burned 350 lifting" and it logs it. With an AI key (Gemini or Claude) you can type anything. Without a key, the buttons and a few simple phrases still work.

## How to open it

Double-click `docs/index.html`. It opens in your browser and works offline with whatever menu was last collected.

## How the pieces fit

| Piece | File | Job |
| --- | --- | --- |
| Collector | `scraper/collect.js` | Downloads the dining pages and saves `docs/menu-data.js` |
| Parser | `scraper/parse.js` | Pulls meals, stations and nutrition out of a page |
| Places | `scraper/locations.js`, `scraper/chains.js` | The list of places, and the Chick-fil-A numbers |
| Brain | `docs/engine.js` | Hours, plate building, tracking, chat actions, the AI prompt |
| Page | `docs/index.html`, `docs/app.js`, `docs/style.css` | What you see, plus the calls to Gemini or Claude |
| Schedule | `setup/daily-menu-schedule.yml.txt` | Goes on GitHub as `.github/workflows/menus.yml` so GitHub runs the collector every morning (see PLAN.md step 1) |
| Tests | `tests/test.js`, `tests/page-test.js` | Checks that everything still works |

## Updating the menu yourself

With Node 18 or newer installed:

```
node scraper/collect.js
```

## Running the tests

```
node tests/test.js
```

## Your AI key

Paste it in the app under Settings. It is saved in your browser only. Never put a key in any file in this folder, because this folder is published on GitHub.

## Known limits

- The dining site only publishes today's menu, so the agent cannot plan tomorrow.
- A few items on the dining site have numbers that cannot be right (pizza slices listed with 82 g of fat). The app marks them and never auto-picks them.
- Subway, Bento Sushi and Village Juice are not included yet. See PLAN.md.
- The starter menu file in this folder holds dinner menus from Nov 16, 2026. It refreshes the first time the collector runs.
- This is a class project, not medical or nutrition advice.
