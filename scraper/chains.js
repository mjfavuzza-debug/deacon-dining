// National chains on campus. Their menus do not change daily, so the numbers
// are typed in from each chain's own nutrition page.
// Chick-fil-A source: https://www.chick-fil-a.com/nutrition-allergens (read Nov 16, 2026)
// Subway is not here yet: its numbers are in a PDF. See PLAN.md step 6.
const cfa = [
  // name, serving, cal, fat, carbs, protein, sodium
  ['Chick-fil-A Chicken Sandwich', '1 sandwich', 420, 16, 41, 29, 1470],
  ['Spicy Chicken Sandwich', '1 sandwich', 450, 18, 44, 28, 1740],
  ['Chick-fil-A Deluxe Sandwich', '1 sandwich', 490, 21, 43, 32, 1710],
  ['Spicy Deluxe Sandwich', '1 sandwich', 540, 24, 46, 34, 1890],
  ['Grilled Chicken Sandwich', '1 sandwich', 390, 11, 45, 28, 765],
  ['Chick-fil-A Nuggets, 8 ct', '8 nuggets', 250, 11, 11, 27, 1210],
  ['Chick-fil-A Nuggets, 12 ct', '12 nuggets', 380, 17, 16, 40, 1820],
  ['Grilled Nuggets, 8 ct', '8 nuggets', 130, 3, 1, 25, 440],
  ['Grilled Nuggets, 12 ct', '12 nuggets', 200, 4.5, 2, 38, 660],
  ['Chick-n-Strips, 3 ct', '3 strips', 310, 14, 16, 29, 870],
  ['Waffle Potato Fries, Medium', 'medium', 420, 24, 45, 5, 240],
  ['Mac & Cheese, Medium', 'medium', 450, 29, 28, 20, 1190],
  ['Market Salad', '1 salad', 550, 31, 42, 28, 1010],
  ['Cobb Salad', '1 salad', 830, 60, 31, 41, 2180],
  ['Chick-fil-A Chicken Biscuit', '1 biscuit', 460, 23, 45, 19, 1510],
  ['Fruit Cup, Medium', 'medium', 70, 0, 16, 1, 0],
  ['Chick-fil-A Lemonade, Medium', 'medium', 260, 0, 66, 0, 0],
  ['Vanilla Milkshake', '1 shake', 580, 23, 82, 13, 390],
];
const station = (n) => /Fries|Mac|Fruit/.test(n) ? 'Sides' : /Lemonade|Milkshake/.test(n) ? 'Drinks & Treats' : /Salad/.test(n) ? 'Salads' : 'Entrees';

module.exports = function chains() {
  const recipes = {};
  const stations = {};
  cfa.forEach((r, i) => {
    const id = 'cfa' + i;
    recipes[id] = { name: r[0], serving: r[1], cal: r[2], fat: r[3], carbs: r[4], protein: r[5], sodium: r[6], satFat: null, sugar: null, fiber: null, tags: [], allergens: '' };
    (stations[station(r[0])] = stations[station(r[0])] || []).push(id);
  });
  return {
    recipes,
    locations: [{
      id: 'cfa', name: 'Chick-fil-A', where: 'Benson Center', kind: 'chain',
      url: 'https://www.chick-fil-a.com/nutrition-allergens',
      note: "Numbers from Chick-fil-A's own nutrition page, read Nov 16, 2026. Check posted hours on campus.",
      meals: [{ name: 'Menu', hours: '', stations: Object.keys(stations).map((k) => ({ name: k, items: stations[k] })) }],
    }],
  };
};
