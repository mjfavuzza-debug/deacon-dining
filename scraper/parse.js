// Turns the HTML of a dining.wfu.edu location page into clean menu data.
// No dependencies. Works in Node and in a browser.

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function fact(facts, label) {
  const f = (facts || []).find((x) => x.label === label);
  return f && typeof f.value === 'number' ? Math.round(f.value * 10) / 10 : null;
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-&/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

function parseMenu(html) {
  const recipes = {};
  const meals = [];
  let errors = 0;

  // Meal period labels, e.g. "DINNER (4:30pm-9pm)"
  const labels = [];
  const navRe = /c-tabs-nav__link-inner">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = navRe.exec(html))) {
    labels.push(decodeEntities(m[1].replace(/<[^>]+>/g, '').trim()));
  }

  // Walk the page in order: meal tab -> station heading -> recipe JSON blocks
  const re = /<div class="c-tab(?: [^"]*)?">|<h4 class="toggle-menu-station-data"[^>]*>([\s\S]*?)<\/h4>|<div id="recipe-nutrition-([^"]+)"[^>]*>([\s\S]*?)<\/div>/g;
  let meal = null;
  let station = null;
  while ((m = re.exec(html))) {
    if (m[1] === undefined && m[2] === undefined) {
      const label = labels[meals.length] || 'Meal ' + (meals.length + 1);
      const lm = label.match(/^(.*?)\s*\((.*)\)\s*$/);
      meal = { name: titleCase(lm ? lm[1] : label), hours: lm ? lm[2] : '', stations: [] };
      meals.push(meal);
      station = null;
    } else if (m[1] !== undefined) {
      if (!meal) continue;
      station = { name: titleCase(decodeEntities(m[1].replace(/<[^>]+>/g, '').trim())), items: [] };
      meal.stations.push(station);
    } else {
      if (!meal) continue;
      if (!station) {
        station = { name: 'Other', items: [] };
        meal.stations.push(station);
      }
      const id = m[2];
      if (!recipes[id]) {
        let data;
        try {
          data = JSON.parse(m[3].trim());
        } catch (e) {
          try {
            data = JSON.parse(decodeEntities(m[3].trim()));
          } catch (e2) {
            errors++;
            continue;
          }
        }
        const f = data.facts || [];
        recipes[id] = {
          name: (data.name || '').trim(),
          serving: (data.serving_size || '').trim(),
          cal: fact(f, 'Calories'),
          protein: fact(f, 'Protein'),
          carbs: fact(f, 'Total Carbohydrate'),
          fat: fact(f, 'Total Fat'),
          satFat: fact(f, 'Saturated Fat'),
          sugar: fact(f, 'Total Sugars'),
          fiber: fact(f, 'Dietary Fiber'),
          sodium: fact(f, 'Sodium'),
          tags: (data.attributes || []).map((a) => a.icon).filter(Boolean),
          allergens: (data.allergens_list || '').trim(),
        };
      }
      // Some entries on the dining site have macros that cannot add up to the
      // listed calories (a slice of pizza with 82 g of fat). Mark those.
      const r = recipes[id];
      if (r && r.cal !== null && (r.fat || 0) * 9 + (r.protein || 0) * 4 + (r.carbs || 0) * 4 > r.cal * 1.6 + 60) r.flag = true;
      if (!station.items.includes(id)) station.items.push(id);
    }
  }
  meals.forEach((ml) => { ml.stations = ml.stations.filter((s) => s.items.length); });
  return { meals: meals.filter((ml) => ml.stations.length), recipes, errors };
}

if (typeof module !== 'undefined') module.exports = { parseMenu };
