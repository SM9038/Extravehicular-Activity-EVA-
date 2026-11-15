/**
 * NASA Mars Explorer — Official Martian Geographical Gazetteer (Offline Indexed)
 *
 * Coordinate Convention:
 * - Planetocentric Latitude: -90° to +90° (North positive, South negative)
 * - East Longitude: 0° to 360°E (IAU 2000+ Areocentric +East frame, matching MOLA DEM grid)
 *
 * Primary Source Attribution:
 * - IAU / USGS Gazetteer of Planetary Nomenclature (planetarynames.wr.usgs.gov)
 * - NASA Mars Exploration Mission Landing Site Ephemerides (JPL / PDS)
 */

export const GAZETTEER_SOURCE_IAU_USGS = 'IAU / USGS Gazetteer of Planetary Nomenclature';

export const MARS_GAZETTEER_ENTRIES = [
  {
    id: 'iau_olympus_mons',
    name: 'Olympus Mons',
    officialName: 'Olympus Mons',
    featureType: 'Mons, montes (Shield Volcano)',
    qualifier: 'IAU Official Volcanic Summit Center',
    lat: 18.65,
    lon: 226.20,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['nix olympica', 'largest volcano', 'tharsis shield'],
    description: 'Tallest shield volcano in the Solar System (+21.2 km above datum, 600 km edifice diameter).'
  },
  {
    id: 'iau_valles_marineris',
    name: 'Valles Marineris',
    officialName: 'Valles Marineris',
    featureType: 'Vallis, valles (Tectonic Canyon System)',
    qualifier: 'IAU Official Canyon System Center',
    lat: -14.01,
    lon: 301.41,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['grand canyon of mars', 'mariner valley', 'coprates'],
    description: 'Vast tectonic rift and canyon system spanning >4,000 km across equatorial Mars, up to 7 km deep.'
  },
  {
    id: 'iau_gale_crater',
    name: 'Gale Crater',
    officialName: 'Gale',
    featureType: 'Crater, craters (Impact Crater)',
    qualifier: 'IAU Official Crater Center',
    lat: -5.37,
    lon: 137.81,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['aeolis mons', 'mount sharp', 'gale'],
    description: '154 km ancient impact crater hosting central sedimentary massif Aeolis Mons (Mount Sharp).'
  },
  {
    id: 'nasa_gale_curiosity',
    name: 'Gale Crater — Curiosity Landing Site (Bradbury Landing)',
    officialName: 'Bradbury Landing (Gale Crater)',
    featureType: 'Rover Landing Site (NASA MSL)',
    qualifier: 'MSL Curiosity Touchdown Site',
    lat: -4.5895,
    lon: 137.4417,
    source: 'NASA Mars Science Laboratory (MSL) / JPL',
    aliases: ['curiosity', 'msl', 'bradbury landing', 'aeolis palus'],
    description: 'Touchdown site of NASA Curiosity rover on Aeolis Palus inside northern Gale Crater.'
  },
  {
    id: 'iau_jezero_crater',
    name: 'Jezero Crater',
    officialName: 'Jezero',
    featureType: 'Crater, craters (Paleolake Basin)',
    qualifier: 'IAU Official Crater Center',
    lat: 18.41,
    lon: 77.69,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['jezero', 'isidis rim'],
    description: '45 km impact crater containing an ancient river delta on the western rim of Isidis Planitia.'
  },
  {
    id: 'nasa_jezero_perseverance',
    name: 'Jezero Crater — Perseverance Landing Site',
    officialName: 'Octavia E. Butler Landing (Jezero Crater)',
    featureType: 'Rover Landing Site (NASA Mars 2020)',
    qualifier: 'Perseverance Touchdown Site',
    lat: 18.38,
    lon: 77.58,
    source: 'NASA Mars 2020 Mission / JPL',
    aliases: ['perseverance', 'ingenuity', 'mars 2020'],
    description: 'Touchdown site of NASA Perseverance rover and Ingenuity helicopter near the Jezero delta.'
  },
  {
    id: 'iau_elysium_mons',
    name: 'Elysium Mons',
    officialName: 'Elysium Mons',
    featureType: 'Mons, montes (Shield Volcano)',
    qualifier: 'Elysium Volcanic Province',
    lat: 25.02,
    lon: 147.21,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['elysium', 'elysium planitia volcano'],
    description: 'Prominent +12.6 km shield volcano rising above the Elysium volcanic province in the eastern hemisphere.'
  },
  {
    id: 'iau_hellas_planitia',
    name: 'Hellas Planitia',
    officialName: 'Hellas Planitia',
    featureType: 'Planitia, planitiae (Impact Basin)',
    qualifier: 'Southern Hemisphere Giant Basin',
    lat: -42.43,
    lon: 70.50,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['hellas', 'hellas basin'],
    description: 'Largest visible impact structure on Mars (~2,300 km diameter), reaching -7.3 km below datum.'
  },
  {
    id: 'iau_tharsis_montes',
    name: 'Tharsis Montes',
    officialName: 'Tharsis Montes',
    featureType: 'Mons, montes (Volcanic Chain)',
    qualifier: 'IAU Chain Center (Ascraeus, Pavonis, Arsia)',
    lat: 1.57,
    lon: 247.42,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['tharsis', 'tharsis rise', 'tharsis bulge'],
    description: 'Diagonal alignment of three giant equatorial shield volcanoes across the Tharsis volcanic plateau.'
  },
  {
    id: 'iau_arsia_mons',
    name: 'Arsia Mons',
    officialName: 'Arsia Mons',
    featureType: 'Mons, montes (Shield Volcano)',
    qualifier: 'Southern Tharsis Montes',
    lat: -8.26,
    lon: 239.91,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['arsia', 'southern tharsis'],
    description: 'Southernmost Tharsis Montes shield volcano with an expansive 110 km summit caldera.'
  },
  {
    id: 'iau_pavonis_mons',
    name: 'Pavonis Mons',
    officialName: 'Pavonis Mons',
    featureType: 'Mons, montes (Shield Volcano)',
    qualifier: 'Central Equatorial Tharsis Montes',
    lat: 1.48,
    lon: 247.04,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['pavonis', 'middle tharsis'],
    description: 'Central shield volcano of Tharsis Montes straddling the Martian equator (+14.1 km summit).'
  },
  {
    id: 'iau_ascraeus_mons',
    name: 'Ascraeus Mons',
    officialName: 'Ascraeus Mons',
    featureType: 'Mons, montes (Shield Volcano)',
    qualifier: 'Northern Tharsis Montes',
    lat: 11.92,
    lon: 255.92,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['ascraeus', 'northern tharsis'],
    description: 'Northernmost and tallest shield volcano of Tharsis Montes (+18.2 km summit elevation).'
  },
  {
    id: 'iau_utopia_planitia',
    name: 'Utopia Planitia',
    officialName: 'Utopia Planitia',
    featureType: 'Planitia, planitiae (Northern Impact Plain)',
    qualifier: 'IAU Official Basin Center',
    lat: 46.74,
    lon: 117.52,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['utopia', 'viking 2 region', 'zhurong'],
    description: 'Largest recognized impact basin in the Solar System (~3,560 km diameter) across the northern lowlands.'
  },
  {
    id: 'iau_amazonis_planitia',
    name: 'Amazonis Planitia',
    officialName: 'Amazonis Planitia',
    featureType: 'Planitia, planitiae (Smooth Volcanic Plain)',
    qualifier: 'IAU Official Plain Center',
    lat: 25.75,
    lon: 197.09,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['amazonis'],
    description: 'Extremely smooth, gently sloping lowland plain nestled between Tharsis and Elysium.'
  },
  {
    id: 'iau_argyre_planitia',
    name: 'Argyre Planitia',
    officialName: 'Argyre Planitia',
    featureType: 'Planitia, planitiae (Impact Basin)',
    qualifier: 'Southern Highlands Impact Basin',
    lat: -49.84,
    lon: 316.69,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['argyre'],
    description: 'Deep ~800 km southern hemisphere impact basin encircled by rugged Charitum and Nereidum Montes.'
  },
  {
    id: 'iau_isidis_planitia',
    name: 'Isidis Planitia',
    officialName: 'Isidis Planitia',
    featureType: 'Planitia, planitiae (Mascon Basin)',
    qualifier: 'Eastern Equatorial Lowland Basin',
    lat: 13.94,
    lon: 88.38,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['isidis', 'beagle 2'],
    description: '1,500 km impact basin east of Syrtis Major featuring flat sediment plains and strong mascon gravity anomaly.'
  },
  {
    id: 'iau_alba_mons',
    name: 'Alba Mons',
    officialName: 'Alba Mons',
    featureType: 'Mons, montes (Low-Slope Volcanic Construct)',
    qualifier: 'Northern Tharsis Frontier',
    lat: 41.08,
    lon: 249.29,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['alba patera', 'alba'],
    description: 'Volcanic edifice with the largest areal footprint on Mars (>1,600 km across) and gentle flank slopes.'
  },
  {
    id: 'iau_syrtis_major_planum',
    name: 'Syrtis Major Planum',
    officialName: 'Syrtis Major Planum',
    featureType: 'Planum, plana (Volcanic Shield Plateau)',
    qualifier: 'Eastern Highlands Shield',
    lat: 9.20,
    lon: 67.10,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['syrtis major', 'syrtis'],
    description: 'Low-relief dark basaltic shield volcano between Isidis Planitia and the cratered southern highlands.'
  },
  {
    id: 'iau_chryse_planitia',
    name: 'Chryse Planitia',
    officialName: 'Chryse Planitia',
    featureType: 'Planitia, planitiae (Outflow Basin Plain)',
    qualifier: 'Viking 1 / Pathfinder Region',
    lat: 28.43,
    lon: 319.69,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['chryse', 'viking 1', 'pathfinder'],
    description: 'Smooth northern lowland plain receiving colossal ancient outflow channels north of Valles Marineris.'
  },
  {
    id: 'iau_acidalia_planitia',
    name: 'Acidalia Planitia',
    officialName: 'Acidalia Planitia',
    featureType: 'Planitia, planitiae (Northern Lowland Plain)',
    qualifier: 'IAU Official Plain Center',
    lat: 49.76,
    lon: 339.26,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['acidalia', 'ares vallis north'],
    description: 'Broad dark northern lowland plain situated between the Tharsis rise and Arabia Terra.'
  },
  {
    id: 'iau_arcadia_planitia',
    name: 'Arcadia Planitia',
    officialName: 'Arcadia Planitia',
    featureType: 'Planitia, planitiae (Smooth Lowland Plain)',
    qualifier: 'Subsurface Ice-Rich Plain',
    lat: 49.02,
    lon: 188.15,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['arcadia'],
    description: 'Smooth, flat volcanic plain northwest of Tharsis known for shallow buried water-ice sheets.'
  },
  {
    id: 'iau_gusev_crater',
    name: 'Gusev Crater — Spirit Landing Region',
    officialName: 'Gusev',
    featureType: 'Crater, craters (Rover Landing Site)',
    qualifier: 'NASA MER-A Spirit Exploration Site',
    lat: -14.53,
    lon: 175.52,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['gusev', 'spirit', 'columbia hills'],
    description: '166 km crater along the highland-lowland boundary explored by NASA Mars Exploration Rover Spirit.'
  },
  {
    id: 'iau_meridiani_planum',
    name: 'Meridiani Planum',
    officialName: 'Meridiani Planum',
    featureType: 'Planum, plana (Equatorial Plain)',
    qualifier: 'IAU Official Plain Center',
    lat: -0.04,
    lon: 356.90,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['meridiani', 'terra meridiani'],
    description: 'Hematite-bearing equatorial plain near the Martian prime meridian.'
  },
  {
    id: 'nasa_meridiani_opportunity',
    name: 'Meridiani Planum — Opportunity Landing Site (Eagle Crater)',
    officialName: 'Challenger Memorial Station (Meridiani Planum)',
    featureType: 'Rover Landing Site (NASA MER-B)',
    qualifier: 'Opportunity Touchdown Site',
    lat: -1.9462,
    lon: 354.4734,
    source: 'NASA Mars Exploration Rover (MER-B) / IAU 2000',
    aliases: ['opportunity', 'eagle crater', 'endeavour crater'],
    description: 'Touchdown site of NASA Opportunity rover inside Eagle Crater on Meridiani Planum.'
  },
  {
    id: 'iau_kasei_valles',
    name: 'Kasei Valles',
    officialName: 'Kasei Valles',
    featureType: 'Vallis, valles (Outflow Channel System)',
    qualifier: 'Northern Chryse Outflow Canyon',
    lat: 25.14,
    lon: 297.12,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['kasei'],
    description: 'Massive ancient catastrophic outflow channel system stretching over 1,500 km into Chryse Planitia.'
  },
  {
    id: 'iau_planum_boreum',
    name: 'Planum Boreum (North Pole)',
    officialName: 'Planum Boreum',
    featureType: 'Planum, plana (Polar Ice Plateau)',
    qualifier: 'North Polar Layered Deposits',
    lat: 87.32,
    lon: 54.96,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['north pole', 'boreum', 'polar cap north'],
    description: 'Permanent northern polar water/CO2 ice cap plateau with extreme cryogenic temperatures.'
  },
  {
    id: 'iau_planum_australe',
    name: 'Planum Australe (South Pole)',
    officialName: 'Planum Australe',
    featureType: 'Planum, plana (Polar Ice Plateau)',
    qualifier: 'South Polar Layered Deposits',
    lat: -83.35,
    lon: 157.70,
    source: GAZETTEER_SOURCE_IAU_USGS,
    aliases: ['south pole', 'australe', 'polar cap south'],
    description: 'Permanent southern polar plateau rising >3 km above datum with seasonal CO2 frost cover.'
  }
];

/**
 * Normalize query text for case-, whitespace-, and punctuation-insensitive lookup.
 */
export function normalizeLocationQuery(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[—–\-_/.,:;()'"°]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build local offline inverted/normalized search index once at module load
const INDEXED_GAZETTEER = MARS_GAZETTEER_ENTRIES.map((entry) => {
  const normName = normalizeLocationQuery(entry.name);
  const normOfficial = normalizeLocationQuery(entry.officialName || entry.name);
  const normType = normalizeLocationQuery(entry.featureType || '');
  const normQualifier = normalizeLocationQuery(entry.qualifier || '');
  const normAliases = (entry.aliases || []).map(a => normalizeLocationQuery(a)).filter(Boolean);
  const searchCorpus = [normName, normOfficial, normType, normQualifier, ...normAliases].join(' ');
  const tokens = Array.from(new Set(searchCorpus.split(' ').filter(Boolean)));
  return {
    ...entry,
    _normName: normName,
    _normOfficial: normOfficial,
    _normType: normType,
    _normAliases: normAliases,
    _searchCorpus: searchCorpus,
    _tokens: tokens
  };
});

/**
 * Search the pre-indexed offline Mars gazetteer.
 * Supports partial names, case insensitivity, spaces, and common punctuation.
 */
export function searchMarsGazetteer(query, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 12;
  const normQ = normalizeLocationQuery(query);

  if (!normQ) {
    return INDEXED_GAZETTEER.slice(0, limit).map(stripIndexFields);
  }

  const queryTokens = normQ.split(' ').filter(Boolean);
  const scored = [];

  for (const item of INDEXED_GAZETTEER) {
    // Require all query tokens to match somewhere in the indexed feature representation
    const allTokensMatch = queryTokens.every(qt =>
      item._searchCorpus.includes(qt)
    );
    if (!allTokensMatch) continue;

    let score = 0;
    if (item._normName === normQ || item._normOfficial === normQ) {
      score = 1000;
    } else if (item._normName.startsWith(normQ) || item._normOfficial.startsWith(normQ)) {
      score = 800;
    } else if (item._normAliases.some(a => a === normQ)) {
      score = 720;
    } else if (item._normName.includes(normQ)) {
      score = 600;
    } else if (item._normAliases.some(a => a.startsWith(normQ))) {
      score = 520;
    } else if (item._tokens.some(t => queryTokens.some(qt => t.startsWith(qt)))) {
      score = 420;
    } else {
      score = 250;
    }

    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name);
  });

  return scored.slice(0, limit).map(s => stripIndexFields(s.item));
}

function stripIndexFields(item) {
  const { _normName, _normOfficial, _normType, _normAliases, _searchCorpus, _tokens, ...clean } = item;
  return clean;
}

/**
 * Validate geographic coordinates against Mars bounds (Planetocentric [-90, 90], East [0, 360]).
 */
export function validateMarsCoordinates(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return { valid: false, reason: 'Latitude and longitude must be valid numbers.' };
  }
  if (latNum < -90 || latNum > 90) {
    return { valid: false, reason: `Latitude ${latNum.toFixed(2)}° is outside valid Martian bounds (-90° to +90°).` };
  }
  if (lonNum < 0 || lonNum > 360) {
    return { valid: false, reason: `East longitude ${lonNum.toFixed(2)}°E is outside valid Martian bounds (0° to 360°E).` };
  }
  return { valid: true, lat: latNum, lon: lonNum };
}

export function formatMarsCoords(lat, lon, decimals = 2) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  const latHem = latNum >= 0 ? 'N' : 'S';
  return `${Math.abs(latNum).toFixed(decimals)}°${latHem}, ${lonNum.toFixed(decimals)}°E`;
}
