# Deacon Plate: plan for the remaining steps

Written Nov 16, 2026. Each step is small enough to hand to Claude Code with a smaller model. Paste the "Prompt" line into Claude Code while it is open in this folder.

## Done

1. Menu collector for the Pit, North Dining Hall, Zick's, La Sabrosa, Shorty's, plus Chick-fil-A from the chain's nutrition page.
2. The app: top pick, plate builder with shuffle, daily tracker, workouts, chat (Gemini or Claude, or no key), browse and filters, settings.
3. Tests: 10 logic tests and a full page test, all passing on the real Nov 16 dinner menus.
4. Daily schedule file for GitHub.

## Step 1: get the code onto GitHub (needs Marco)

Claude could see the `deacon-dining` repository but was not allowed to push to it. Pick one:

- Install the Claude GitHub App on the repository at https://github.com/apps/claude/installations/select_target, then ask Claude to push.
- Or upload by hand: on github.com open the repository, choose "uploading an existing file", and drag in the `docs`, `scraper`, `tests` and `setup` folders plus `README.md` and `PLAN.md`.

Prompt: "Push everything in this folder to the main branch of mjfavuzza-debug/deacon-dining."

Then add the daily schedule. Claude was not allowed to save this one file into the folder, so its text is in `setup/daily-menu-schedule.yml.txt`:

1. On GitHub open the repository, click "Add file", "Create new file".
2. Name it exactly `.github/workflows/menus.yml` (typing the slashes creates the folders).
3. Paste in everything from `setup/daily-menu-schedule.yml.txt` and click "Commit changes".

## Step 2: turn on the public link (needs Marco, two minutes)

1. On GitHub: Settings, Pages, Source "Deploy from a branch", Branch `main`, folder `/docs`, Save.
2. On GitHub: Actions, "Collect today's menus", "Run workflow". This fills in today's full menu and proves the daily schedule works.
3. The link will be https://mjfavuzza-debug.github.io/deacon-dining/

If the collector fails on GitHub with an HTTP error, the dining site may be blocking GitHub's servers. Fallback: run `node scraper/collect.js` on the laptop each morning and push.

## Step 3: first real AI chat (needs Marco's key)

1. Open the app, Settings, paste the Gemini key, Save.
2. Type "I just lifted for 45 minutes, what should I eat?"
3. If it errors: the model name or web address may have changed. Check https://ai.google.dev/gemini-api/docs/models and update `DEFAULT_MODEL` and the fetch address in `docs/app.js` (function `callAI`).

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
