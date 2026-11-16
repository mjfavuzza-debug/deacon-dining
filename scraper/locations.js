// Every place the collector reads. kind: "hall" = menu changes daily by meal,
// "retail" = fixed menu on the WFU dining site.
module.exports = [
  { id: 'pit', name: 'The Pit', where: 'Reynolda Hall', kind: 'hall', url: 'https://dining.wfu.edu/locations/pit-residential-dining-hall/' },
  { id: 'north', name: 'North Dining Hall', where: 'Hilltop Market', kind: 'hall', url: 'https://dining.wfu.edu/locations/north-dining-hall/' },
  { id: 'zicks', name: "Zick's", where: 'Poteat Hall', kind: 'retail', url: 'https://dining.wfu.edu/locations/zicks/' },
  { id: 'sabrosa', name: 'La Sabrosa', where: 'Benson Center', kind: 'retail', url: 'https://dining.wfu.edu/locations/moes/' },
  { id: 'shortys', name: "Shorty's", where: 'Benson Center', kind: 'retail', url: 'https://dining.wfu.edu/locations/shortys/' },
];
