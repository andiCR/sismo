/* Nearest-town descriptions ("25 km SW of Quepos") for events in and around Costa Rica.
   EMSC region names are often just "Costa Rica", so this gives people a place they recognise.
   Shared by the app and the share-page build script. */
window.Places = (() => {
  'use strict';

  // [name, lat, lon, country, major] — major towns are also drawn on share images.
  const TOWNS = [
    ['San José', 9.9333, -84.0833, 'CR', 1], ['Alajuela', 10.0163, -84.2116, 'CR'], ['Heredia', 9.9981, -84.1165, 'CR'],
    ['Cartago', 9.8644, -83.9194, 'CR'], ['Liberia', 10.6346, -85.4407, 'CR', 1], ['Puntarenas', 9.9763, -84.8384, 'CR', 1],
    ['Limón', 9.9907, -83.0360, 'CR', 1], ['Nicoya', 10.1483, -85.4520, 'CR', 1], ['Santa Cruz', 10.2605, -85.5850, 'CR'],
    ['Tamarindo', 10.2993, -85.8371, 'CR'], ['Sámara', 9.8818, -85.5287, 'CR'], ['Nosara', 9.9794, -85.6533, 'CR'],
    ['Jacó', 9.6146, -84.6285, 'CR', 1], ['Quepos', 9.4310, -84.1617, 'CR', 1], ['Uvita', 9.1607, -83.7392, 'CR'],
    ['Golfito', 8.6395, -83.1806, 'CR', 1], ['Ciudad Neily', 8.6528, -82.9416, 'CR'], ['Puerto Jiménez', 8.5350, -83.3050, 'CR'],
    ['Palmar Norte', 8.9588, -83.4617, 'CR'], ['San Isidro de El General', 9.3722, -83.7036, 'CR', 1], ['San Vito', 8.8206, -82.9708, 'CR'],
    ['Buenos Aires', 9.1683, -83.3342, 'CR'], ['Turrialba', 9.9048, -83.6832, 'CR'], ['Guápiles', 10.2156, -83.7848, 'CR'],
    ['Siquirres', 10.0975, -83.5070, 'CR'], ['Cahuita', 9.7373, -82.8394, 'CR'], ['Puerto Viejo', 9.6567, -82.7546, 'CR'],
    ['Ciudad Quesada', 10.3238, -84.4271, 'CR', 1], ['La Fortuna', 10.4679, -84.6427, 'CR'], ['Upala', 10.8988, -85.0163, 'CR'],
    ['Los Chiles', 11.0333, -84.7167, 'CR'], ['Cañas', 10.4300, -85.0986, 'CR'], ['Tilarán', 10.4686, -84.9681, 'CR'],
    ['Bagaces', 10.5333, -85.2500, 'CR'], ['La Cruz', 11.0730, -85.6300, 'CR'], ['Orotina', 9.9120, -84.5250, 'CR'],
    ['San Ramón', 10.0877, -84.4700, 'CR'], ['Parrita', 9.5210, -84.3230, 'CR'], ['Montezuma', 9.6547, -85.0692, 'CR'],
    ['Paquera', 9.8200, -84.9360, 'CR'],
    ['Rivas', 11.4372, -85.8264, 'NI', 1], ['San Juan del Sur', 11.2529, -85.8705, 'NI'], ['San Carlos', 11.1236, -84.7797, 'NI'],
    ['David', 8.4273, -82.4308, 'PA', 1], ['Bocas del Toro', 9.3403, -82.2420, 'PA'], ['Puerto Armuelles', 8.2833, -82.8667, 'PA'],
  ].map(([name, lat, lon, country, major]) => ({ name, lat, lon, country, major: !!major }));

  const COUNTRY = { CR: 'Costa Rica', NI: 'Nicaragua', PA: 'Panama' };
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const RAD = Math.PI / 180;

  function distKm(aLat, aLon, bLat, bLon) {
    const dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  // Compass direction from the town to the point, e.g. "SW".
  function bearing(aLat, aLon, bLat, bLon) {
    const y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
    const x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) - Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
    const deg = (Math.atan2(y, x) / RAD + 360) % 360;
    return COMPASS[Math.round(deg / 22.5) % 16];
  }

  /** Nearest known town within maxKm, or null: { name, country, km, dir }. */
  function nearest(lat, lon, maxKm = 120) {
    if (lat < 6 || lat > 13 || lon < -88 || lon > -81) return null; // quick reject outside the region
    let best = null, bestKm = Infinity;
    for (const t of TOWNS) {
      const km = distKm(t.lat, t.lon, lat, lon);
      if (km < bestKm) { best = t; bestKm = km; }
    }
    if (!best || bestKm > maxKm) return null;
    return { name: best.name, country: best.country, km: Math.round(bestKm), dir: bearing(best.lat, best.lon, lat, lon) };
  }

  /** "Quepos" for Costa Rican towns, "David, Panamá" for neighbours (country translated by `tr`). */
  function label(n, tr = s => s) {
    return n.country === 'CR' ? n.name : `${n.name}, ${tr(COUNTRY[n.country])}`;
  }

  return { TOWNS, nearest, label, distKm };
})();
