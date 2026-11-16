# Deacon Plate: plan for the remaining steps

Written Nov 16, 2026. Each step is small enough to hand to Claude Code with a smaller model. Paste the "Prompt" line into Claude Code while it is open in this folder.

## Done

1. Menu collector for the Pit, North Dining Hall, Zick's, La Sabrosa, Shorty's, plus Chick-fil-A from the chain's nutrition page.
2. The app: calorie dial and week row, place strip, order-ticket plates with shuffle, daily tracker, workouts, chat (Gemini or Claude, or no key), menus with filters, settings.
3. Tests: 11 logic tests and a full page test, all passing on the real Nov 16 dinner menus.
4. Daily schedule file for GitHub.

## Step 1: code on GitHub (done Nov 16)

The code is at https://github.com/mjfavuzza-debug/deacon-dining, including the daily schedule at `.github/workflows/menus.yml`. GitHub ran the collector once on Nov 16 and it read all five WFU locations. It now runs by itself every morning. `setup/daily-menu-schedule.yml.txt` is only a spare copy of the schedule.

To get the latest version from the laptop folder onto GitHub later, ask Claude: "Push everything in this folder to the main branch of mjfavuzza-debug/deacon-dining."

## Step 2: turn on the public link (needs Marco, one minute)

1. On GitHub open the repository, then Settings, Pages.
2. Under "Build and deployment", set Source to "Deploy from a branch", Branch `main`, folder `/docs`, and click Save.
3. Wait about a minute. The link will be https://mjfavuzza-debug.github.io/deacon-dining/

To collect the menu by hand at any time: Actions, "Collect today's menus", "Run workflow".

## Step 3: first real AI chat (needs Marco's key)

1. Open the app, Settings, paste the Gemini key, Save.
2. Type "I just lifted for 45 minutes, what should I eat?"
3. A 503 error means Google's servers were overloaded. The app now retries and then tries three other Gemini models by itself, so this should be rare.
4. If it still errors: the model name or web address may have changed. Check https://ai.google.dev/gemini-api/docs/models and update `DEFAULT_MODEL` and the fetch address in `docs/app.js` (function `callAI`).

Prompt: "The Gemini chat in docs/app.js returns an error: <paste error>. Check the current Gemini API docs and fix callAI."

To switch to Claude later: Settings, Provider "Anthropic Claude", paste a Claude key. Nothing else changes.

## Step 4: chat that works for everyone without a key

Right now each person needs their own key. To let Professor Macosko use the chat from the link, put a small relay on Cloudflare Workers (free) that holds the key and forwards chat requests, with a daily limit.

Prompt: "Add a Cloudflare Worker in a new folder `worker/` that accepts the same request body as callAI in docs/app.js, adds my Gemini key from a Worker secret, forwards it to Gemini, and limits each visitor to 30 requests per day. Then add a setting in docs/app.js to use the relay URL when no personal key is set. Never write the key into any file."

## Step 5: more places

- Subway: numbers are in a PDF linked from https://www.subway.com/en-us/menunutrition/nutrition. Add the 6-inch subs to `scraper/chains.js` the same way Chick-fil-A is done.
- Bento Sushi and Village Juice: the WFU site publishes no nutrition for them. Add them only if the company itself publishes numbers.
- Chick-fil-A: Cool Wrap and Side Salad were left out because the numbers Claude read looked like they included dressing. Check them on the Chick-fil-A site and add them.

Prompt: "Add Subway to scraper/chains.js using the numbers in this PDF: <attach PDF>. Follow the Chick-fil-A pattern and add a test."

## Step 6: slides and demo script

Suggested demo order (about 4 minutes): open the link, read the top pick, shuffle it, tap "I ate this", type a workout, ask the chat a free-form question, then show the Browse filters with "vegan" on.

Prompt: "Write a 6-slide outline and a 4-minute demo script for Deacon Plate using README.md. Audience: my FYS class on fintech and big data."

## Ideas if there is time

- A weekly chart of calories and protein from the saved days.
- A "favorites" list that the plate builder prefers.
- An "Add to Home Screen" icon so it feels like a phone app.
- Breakfast planning the night before, once the dining site posts tomorrow's menu (it does not today).
