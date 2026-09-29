/* Translations (English / Spanish) and place-name localisation.
   Static markup uses data-i18n (text), data-i18n-html, data-i18n-title and data-i18n-aria. */
window.I18N = (() => {
  'use strict';

  const plural = (n, one, many) => (n === 1 ? one : many);

  const STR = {
    en: {
      'meta.title': 'Sismo · Live Earthquake Map',
      'meta.desc': 'Live earthquake map for Costa Rica and the world, with data from OVSICORI, RSN-UCR, EMSC and USGS.',
      'lang.label': 'Language',
      'source.label': 'Data source',
      'period.label': 'Time period',
      'ctl.source': 'Source', 'ctl.period': 'Period', 'ctl.region': 'Go to',
      'period.7d': '7 days',
      'period.30d': '30 days',
      'periodLong.24h': '24 hours', 'periodLong.7d': '7 days', 'periodLong.30d': '30 days',
      'period.year': ({ year }) => `Notable earthquakes of ${year}`,
      'year.note': ({ year, world, area }) => `Only notable quakes since 1 January ${year}: M${world}+ worldwide and M${area}+ around Costa Rica.`,
      'loadingYear': ({ year, source }) => `Loading ${year}'s notable earthquakes from ${source}…`,
      'regions.label': 'Jump to region',
      'region.ca': 'Central America', 'region.am': 'Americas', 'region.world': 'World',
      'nearMe': 'Near me',
      'ctl.places': 'Places', 'places.label': 'Your saved places',
      'places.addFirst': 'Save a place', 'places.add': 'Add',
      'places.pick': 'Tap the map where the place is',
      'places.pickHint': 'Tap here to cancel',
      'places.name': 'Name', 'places.placeholder': 'Home, work, Mom…',
      'places.save': 'Save', 'places.cancel': 'Cancel', 'places.go': 'Go there', 'places.remove': 'Remove',
      'install.h': 'Install the app',
      'install.text': 'Sismo opens from your home screen, full screen, like an app.',
      'install.ios': 'On iPhone: tap Share, then “Add to Home Screen”.',
      'install.btn': 'Install Sismo',
      'about.title': 'About the data',
      'about.emsc': 'Events from the <a href="https://www.seismicportal.eu" target="_blank" rel="noopener">European-Mediterranean Seismological Centre</a>, which gathers reports from agencies worldwide. For Costa Rica that includes <b>OVSICORI-UNA</b> and <b>RSN-UCR</b>, so small local quakes show up here. New events arrive live over a WebSocket.',
      'about.usgs': 'The <a href="https://earthquake.usgs.gov/earthquakes/feed/" target="_blank" rel="noopener">USGS global feed</a>: roughly M2.5+ worldwide and all magnitudes in the US. Checked for new events every minute.',
      'about.plates.h': 'Plate boundaries',
      'about.plates': 'Bird (2003), <i>An updated digital model of plate boundaries</i>, via fraxen/tectonicplates.',
      'about.privacy.h': 'Privacy',
      'about.privacy': 'Sismo counts visits and which features get used with <a href="https://umami.is" target="_blank" rel="noopener">Umami</a>. No cookies, no ads and nothing that identifies you. Your location, if you share it, and your saved places never leave your device.',
      'about.note': 'Magnitudes and locations are preliminary and can be revised. This is not an official alert service. In an emergency, follow the <a href="https://www.cne.go.cr" target="_blank" rel="noopener">CNE</a> and your local authorities.',
      'loading': 'Loading…',
      'minMag': 'Minimum magnitude',
      'inView': 'Only in map view',
      'sort': 'Sort', 'sort.time': 'Latest', 'sort.mag': 'Strongest',
      'panelToggle': 'Toggle event list',
      'back': 'Back', 'backToList': 'Back to list',
      'layers': 'Map layers',
      'layer.quakes': 'Earthquakes', 'layer.heat': 'Density', 'layer.plates': 'Plate boundaries',
      'layer.volcanoes': 'Volcanoes (CR)', 'layer.labels': 'Labels',
      'colorBy': 'Color by', 'color.depth': 'Depth', 'color.age': 'Age',
      'globe': 'Globe',
      'speed': 'Replay speed',
      'live.btn': 'Live', 'live.title': 'Back to live',
      'timeline.aria': 'Events over time. Drag to scrub through the period.',
      'play': 'Replay period', 'pause': 'Pause replay',
      'status.live': 'Live', 'status.replay': 'Replay', 'status.offline': 'Offline', 'status.connecting': 'Connecting',
      'all': 'All',
      'ago.now': 'just now',
      'ago.min': ({ n }) => `${n} min ago`,
      'ago.h': ({ n }) => `${n} h ago`,
      'ago.d': ({ n }) => `${n} ${plural(n, 'day', 'days')} ago`,
      'depthKm': ({ n }) => `${n} km deep`,
      'awayKm': ({ n }) => `${n} km away`,
      'summary': ({ n, count, inView }) => `<b>${count}</b> ${plural(n, 'event', 'events')}${inView ? ' in view' : ''}`,
      'summary.year': ({ n, count, inView }) => `<b>${count}</b> notable ${plural(n, 'quake', 'quakes')}${inView ? ' in view' : ''}`,
      'strongest': 'strongest',
      'empty': 'No events match.<br>Try a lower magnitude, a longer period, or zoom out.',
      'crTag': 'Reported by a Costa Rican network',
      'd.yourTime': 'Your time', 'd.crTime': 'Costa Rica time', 'd.utc': 'UTC',
      'd.depth': 'Depth', 'd.epicenter': 'Epicenter', 'd.energy': 'Energy released',
      'd.fromYou': 'From you',
      'd.area': 'In the area',
      'd.within.24h': 'within 50 km in the last 24 hours',
      'd.within.7d': 'within 50 km in the last 7 days',
      'd.within.30d': 'within 50 km in the last 30 days',
      'd.within.year': ({ year }) => `within 50 km among ${year}'s notable quakes`,
      'd.nearby': ({ n, mag, ago, within }) => `${n} other ${plural(n, 'event', 'events')} ${within}; strongest M${mag} (${ago}).`,
      'd.noNearby': ({ within }) => `No other events ${within}.`,
      'd.history': ({ km, quake }) => `Nothing this strong within ${km} km since the ${quake}.`,
      'd.historyQuake': ({ mag, date }) => `M${mag} of ${date}`,
      'd.historyNone': ({ km }) => `The strongest within ${km} km in the USGS catalog, which goes back to 1900.`,
      'd.historySource': 'From the USGS catalog',
      'd.depthLine': ({ n, cls }) => `${n} km deep (${cls})`,
      'd.more': 'More data',
      'd.agency': 'Reported by',
      'd.effects': 'Typical effects at this size:',
      'd.deepNote': 'Deep events are usually felt less strongly at the surface.',
      'd.zoom': 'Zoom to epicenter', 'd.report': 'Official report ↗',
      'alert.tsunami': 'Tsunami flag raised: check official tsunami warnings',
      'alert.pager': ({ level }) => `USGS PAGER alert: ${level.toUpperCase()}`,
      'ctx.title': 'Reports and coverage',
      'ctx.loading': 'Looking for reports…',
      'ctx.none': 'No reports about this quake yet.',
      'ctx.fresh': 'Agencies usually publish within the hour.',
      'ctx.rsn': 'RSN-UCR report', 'ctx.rsn.felt': 'Felt in', 'ctx.rsn.map': 'RSN-UCR intensity map',
      'ctx.open': 'Read ↗',
      'ctx.pager': ({ level }) => `PAGER impact alert: ${({ green: 'green', yellow: 'yellow', orange: 'orange', red: 'red' })[level] || level}`,
      'ctx.emsc': ({ n }) => `${n} witness ${plural(n, 'report', 'reports')} on EMSC`,
      'ctx.photos': 'Photos ↗',
      'mmi': ['', 'not felt', 'weak', 'weak', 'light', 'moderate', 'strong', 'very strong', 'severe', 'violent', 'extreme'],
      'shake.estimated': 'Estimated shaking', 'shake.measured': 'Measured shaking',
      'shake.onMap': 'On map',
      'shake.peak': ({ i }) => `Up to ${i} near the epicenter`,
      'shake.you': 'You',
      'shake.notFelt': ({ places }) => (places ? 'Probably not felt at your places.' : 'Probably not felt where you are.'),
      'shake.estimated.note': 'Model from magnitude, depth and distance; local ground can change it',
      'shake.measured.note': 'USGS ShakeMap',
      'shake.felt': ({ n, count }) => `${count} “Did You Feel It?” ${plural(n, 'report', 'reports')}`,
      'shake.reports': 'shown as squares',
      'energy': ({ v, unit }) => `≈ ${v} ${unit} of TNT`,
      'effects': [
        'Usually not felt, but recorded by seismographs.',
        'Often felt near the epicenter. Damage is rare.',
        'Widely felt with light shaking. Minor damage is possible.',
        'Can damage poorly built structures near the epicenter.',
        'Strong. Can be destructive in populated areas.',
        'Major earthquake. Serious damage over large areas.',
        'Great earthquake. Can devastate areas hundreds of kilometers across.',
      ],
      'effects.unknown': 'Magnitude not yet determined.',
      'depth.shallow': 'shallow', 'depth.intermediate': 'intermediate', 'depth.deep': 'deep',
      'toast.new': 'New earthquake',
      'err.load': "Couldn't load events", 'err.retry': 'Click to retry.',
      'loadingData': ({ period, source }) => `Loading ${period} of events from ${source}…`,
      'legend.depth': 'Depth (km)', 'legend.age': 'Time since event', 'legend.sizes': 'Circle size shows magnitude',
      'age.labels': ['now', '1 h', '1 d', '7 d', '30 d'],
      'geo.unavailable': 'Location unavailable',
      'geo.unsupported': 'Your browser does not support geolocation.',
      'geo.failed': "Couldn't get your location",
      'volcano.popup': 'Active volcano · monitored by OVSICORI',
      'attrib.quakes': 'Quakes', 'attrib.plates': 'Plates',
      'nearTown': ({ km, dir, town }) => (km < 3 ? `near ${town}` : `${km} km ${dir} of ${town}`),
      'temblo.q': 'Did it shake?',
      'temblo.near': 'near you',
      'temblo.now': ({ ago }) => `Yes · ${ago}`,
      'temblo.recent': ({ ago }) => `Last felt quake · ${ago}`,
      'temblo.calm': 'No felt quakes in the last 24 h',
      'temblo.last': ({ mag, ago }) => `Last recorded: M${mag}, ${ago}`,
      'temblo.hint': '"Likely felt" is an estimate from magnitude and depth',
      'filters': 'Filters and regions',
      'share': 'Share',
      'share.copied': 'Link copied',
      'share.text': ({ mag, place }) => `M${mag} earthquake · ${place}`,
      'share.preparing': 'Preparing the preview image. Usually 1–2 min.',
      'share.dontWait': "Don't wait",
      'deep.notFound': "Couldn't find that earthquake",
      'deep.adjusted': 'Filters adjusted to show this quake',
      'og.crTime': 'Costa Rica time',
      'og.more': 'Live map and details on Sismo.',
      'og.siteSub': 'Live earthquake map',
      'og.siteLine': 'Costa Rica and the world · data from OVSICORI, RSN-UCR, EMSC and USGS',
      'og.data': ({ agency }) => `Data: ${agency}`,
      'og.mag': 'Magnitude',
    },

    es: {
      'meta.title': 'Sismo · Mapa de sismos en vivo',
      'meta.desc': 'Mapa de sismos en vivo para Costa Rica y el mundo, con datos del OVSICORI, la RSN-UCR, el EMSC y el USGS.',
      'lang.label': 'Idioma',
      'source.label': 'Fuente de datos',
      'period.label': 'Período',
      'ctl.source': 'Fuente', 'ctl.period': 'Período', 'ctl.region': 'Ir a',
      'period.7d': '7 días',
      'period.30d': '30 días',
      'periodLong.24h': '24 horas', 'periodLong.7d': '7 días', 'periodLong.30d': '30 días',
      'period.year': ({ year }) => `Sismos notables de ${year}`,
      'year.note': ({ year, world, area }) => `Solo sismos notables desde el 1 de enero de ${year}: M${world}+ en el mundo y M${area}+ alrededor de Costa Rica.`,
      'loadingYear': ({ year, source }) => `Cargando los sismos notables de ${year} del ${source}…`,
      'regions.label': 'Ir a una región',
      'region.ca': 'Centroamérica', 'region.am': 'América', 'region.world': 'Mundo',
      'nearMe': 'Cerca de mí',
      'ctl.places': 'Lugares', 'places.label': 'Sus lugares guardados',
      'places.addFirst': 'Guardar un lugar', 'places.add': 'Agregar',
      'places.pick': 'Toque el mapa donde está el lugar',
      'places.pickHint': 'Toque aquí para cancelar',
      'places.name': 'Nombre', 'places.placeholder': 'Casa, trabajo, mamá…',
      'places.save': 'Guardar', 'places.cancel': 'Cancelar', 'places.go': 'Ir ahí', 'places.remove': 'Quitar',
      'install.h': 'Instalar la aplicación',
      'install.text': 'Sismo se abre desde la pantalla de inicio, en pantalla completa, como una aplicación.',
      'install.ios': 'En iPhone: toque Compartir y luego «Agregar a inicio».',
      'install.btn': 'Instalar Sismo',
      'about.title': 'Sobre los datos',
      'about.emsc': 'Sismos del <a href="https://www.seismicportal.eu" target="_blank" rel="noopener">Centro Sismológico Euromediterráneo</a> (EMSC), que reúne reportes de agencias de todo el mundo. Para Costa Rica incluye al <b>OVSICORI-UNA</b> y a la <b>RSN-UCR</b>, por lo que aquí aparecen también los sismos locales pequeños. Los nuevos eventos llegan en vivo por WebSocket.',
      'about.usgs': 'El <a href="https://earthquake.usgs.gov/earthquakes/feed/" target="_blank" rel="noopener">catálogo global del USGS</a>: aproximadamente M2.5+ en todo el mundo y todas las magnitudes en EE. UU. Se consulta cada minuto.',
      'about.plates.h': 'Límites de placas',
      'about.plates': 'Bird (2003), <i>An updated digital model of plate boundaries</i>, vía fraxen/tectonicplates.',
      'about.privacy.h': 'Privacidad',
      'about.privacy': 'Sismo cuenta las visitas y qué funciones se usan con <a href="https://umami.is" target="_blank" rel="noopener">Umami</a>. Sin cookies, sin anuncios y sin nada que lo identifique. Su ubicación, si la comparte, y sus lugares guardados nunca salen de su dispositivo.',
      'about.note': 'Las magnitudes y ubicaciones son preliminares y pueden cambiar. Este no es un servicio oficial de alertas. En una emergencia, siga las indicaciones de la <a href="https://www.cne.go.cr" target="_blank" rel="noopener">CNE</a> y de las autoridades locales.',
      'loading': 'Cargando…',
      'minMag': 'Magnitud mínima',
      'inView': 'Solo área visible',
      'sort': 'Ordenar', 'sort.time': 'Recientes', 'sort.mag': 'Más fuertes',
      'panelToggle': 'Mostrar u ocultar la lista',
      'back': 'Volver', 'backToList': 'Volver a la lista',
      'layers': 'Capas del mapa',
      'layer.quakes': 'Sismos', 'layer.heat': 'Densidad', 'layer.plates': 'Límites de placas',
      'layer.volcanoes': 'Volcanes (CR)', 'layer.labels': 'Etiquetas',
      'colorBy': 'Color según', 'color.depth': 'Profundidad', 'color.age': 'Antigüedad',
      'globe': 'Globo',
      'speed': 'Velocidad de repetición',
      'live.btn': 'En vivo', 'live.title': 'Volver a en vivo',
      'timeline.aria': 'Sismos a lo largo del tiempo. Arrastre para recorrer el período.',
      'play': 'Repetir el período', 'pause': 'Pausar la repetición',
      'status.live': 'En vivo', 'status.replay': 'Repetición', 'status.offline': 'Sin conexión', 'status.connecting': 'Conectando',
      'all': 'Todas',
      'ago.now': 'ahora mismo',
      'ago.min': ({ n }) => `hace ${n} min`,
      'ago.h': ({ n }) => `hace ${n} h`,
      'ago.d': ({ n }) => `hace ${n} ${plural(n, 'día', 'días')}`,
      'depthKm': ({ n }) => `prof. ${n} km`,
      'awayKm': ({ n }) => `a ${n} km`,
      'summary': ({ n, count, inView }) => `<b>${count}</b> ${plural(n, 'sismo', 'sismos')}${inView ? ' en la vista' : ''}`,
      'summary.year': ({ n, count, inView }) => `<b>${count}</b> ${plural(n, 'sismo notable', 'sismos notables')}${inView ? ' en la vista' : ''}`,
      'strongest': 'el mayor',
      'empty': 'Ningún sismo coincide.<br>Pruebe una magnitud menor, un período más largo o aleje el mapa.',
      'crTag': 'Reportado por una red sismológica costarricense',
      'd.yourTime': 'Hora local', 'd.crTime': 'Hora de Costa Rica', 'd.utc': 'UTC',
      'd.depth': 'Profundidad', 'd.epicenter': 'Epicentro', 'd.energy': 'Energía liberada',
      'd.fromYou': 'Distancia a usted',
      'd.area': 'En la zona',
      'd.within.24h': 'a menos de 50 km en las últimas 24 horas',
      'd.within.7d': 'a menos de 50 km en los últimos 7 días',
      'd.within.30d': 'a menos de 50 km en los últimos 30 días',
      'd.within.year': ({ year }) => `a menos de 50 km entre los sismos notables de ${year}`,
      'd.nearby': ({ n, mag, ago, within }) => `${n} ${plural(n, 'sismo más', 'sismos más')} ${within}; el mayor, M${mag} (${ago}).`,
      'd.noNearby': ({ within }) => `Ningún otro sismo ${within}.`,
      'd.history': ({ km, quake }) => `Ninguno tan fuerte a menos de ${km} km desde el ${quake}.`,
      'd.historyQuake': ({ mag, date }) => `M${mag} del ${date}`,
      'd.historyNone': ({ km }) => `El más fuerte a menos de ${km} km en el catálogo del USGS, que empieza en 1900.`,
      'd.historySource': 'Según el catálogo del USGS',
      'd.depthLine': ({ n, cls }) => `${n} km de profundidad (${cls})`,
      'd.more': 'Más datos',
      'd.agency': 'Reportado por',
      'd.effects': 'Efectos típicos a esta magnitud:',
      'd.deepNote': 'Los sismos profundos suelen sentirse con menos fuerza en la superficie.',
      'd.zoom': 'Acercar al epicentro', 'd.report': 'Reporte oficial ↗',
      'alert.tsunami': 'Indicador de tsunami activado: consulte los avisos oficiales',
      'alert.pager': ({ level }) => `Alerta PAGER del USGS: ${({ green: 'VERDE', yellow: 'AMARILLA', orange: 'NARANJA', red: 'ROJA' })[level] || level.toUpperCase()}`,
      'ctx.title': 'Informes y cobertura',
      'ctx.loading': 'Buscando informes…',
      'ctx.none': 'Todavía no hay informes sobre este sismo.',
      'ctx.fresh': 'Las agencias suelen publicar en la primera hora.',
      'ctx.rsn': 'Informe de la RSN-UCR', 'ctx.rsn.felt': 'Sentido en', 'ctx.rsn.map': 'Mapa de intensidades de la RSN-UCR',
      'ctx.open': 'Ver ↗',
      'ctx.pager': ({ level }) => `Alerta de impacto PAGER: ${({ green: 'verde', yellow: 'amarilla', orange: 'naranja', red: 'roja' })[level] || level}`,
      'ctx.emsc': ({ n }) => `${n} ${plural(n, 'testimonio', 'testimonios')} en el EMSC`,
      'ctx.photos': 'Fotos ↗',
      'mmi': ['', 'no sentido', 'débil', 'débil', 'leve', 'moderado', 'fuerte', 'muy fuerte', 'severo', 'violento', 'extremo'],
      'shake.estimated': 'Sacudida estimada', 'shake.measured': 'Sacudida medida',
      'shake.onMap': 'En el mapa',
      'shake.peak': ({ i }) => `Hasta ${i} cerca del epicentro`,
      'shake.you': 'Usted',
      'shake.notFelt': ({ places }) => (places ? 'Probablemente no se sintió en sus lugares.' : 'Probablemente no se sintió donde usted está.'),
      'shake.estimated.note': 'Modelo según magnitud, profundidad y distancia; el suelo local puede cambiarla',
      'shake.measured.note': 'ShakeMap del USGS',
      'shake.felt': ({ n, count }) => `${count} ${plural(n, 'reporte', 'reportes')} «¿Lo sintió?»`,
      'shake.reports': 'en cuadros en el mapa',
      'energy': ({ v, unit }) => `≈ ${v} ${unit} de TNT`,
      'effects': [
        'Por lo general no se siente, pero lo registran los sismógrafos.',
        'A menudo se siente cerca del epicentro. Rara vez causa daños.',
        'Se siente en una zona amplia, con sacudida leve. Puede causar daños menores.',
        'Puede dañar construcciones débiles cerca del epicentro.',
        'Fuerte. Puede ser destructivo en zonas pobladas.',
        'Terremoto mayor. Daños graves en áreas extensas.',
        'Gran terremoto. Puede devastar zonas de cientos de kilómetros.',
      ],
      'effects.unknown': 'Magnitud aún no determinada.',
      'depth.shallow': 'superficial', 'depth.intermediate': 'intermedio', 'depth.deep': 'profundo',
      'toast.new': 'Nuevo sismo',
      'err.load': 'No se pudieron cargar los sismos', 'err.retry': 'Haga clic para reintentar.',
      'loadingData': ({ period, source }) => `Cargando ${period} de sismos del ${source}…`,
      'legend.depth': 'Profundidad (km)', 'legend.age': 'Tiempo desde el sismo', 'legend.sizes': 'El tamaño del círculo indica la magnitud',
      'age.labels': ['ahora', '1 h', '1 d', '7 d', '30 d'],
      'geo.unavailable': 'Ubicación no disponible',
      'geo.unsupported': 'Su navegador no permite la geolocalización.',
      'geo.failed': 'No se pudo obtener su ubicación',
      'volcano.popup': 'Volcán activo · vigilado por el OVSICORI',
      'attrib.quakes': 'Sismos', 'attrib.plates': 'Placas',
      'nearTown': ({ km, dir, town }) => (km < 3 ? `cerca de ${town}` : `${km} km al ${dir.replace(/W/g, 'O')} de ${town}`),
      'temblo.q': '¿Tembló?',
      'temblo.near': 'cerca de usted',
      'temblo.now': ({ ago }) => `Sí · ${ago}`,
      'temblo.recent': ({ ago }) => `Último sismo sentido · ${ago}`,
      'temblo.calm': 'Ningún sismo sentido en las últimas 24 h',
      'temblo.last': ({ mag, ago }) => `Último registrado: M${mag}, ${ago}`,
      'temblo.hint': '«Probablemente sentido» es una estimación según magnitud y profundidad',
      'filters': 'Filtros y regiones',
      'share': 'Compartir',
      'share.copied': 'Enlace copiado',
      'share.text': ({ mag, place }) => `Sismo M${mag} · ${place}`,
      'share.preparing': 'Preparando la imagen para compartir. Suele tardar 1–2 min.',
      'share.dontWait': 'No esperar',
      'deep.notFound': 'No se encontró ese sismo',
      'deep.adjusted': 'Filtros ajustados para mostrar este sismo',
      'og.crTime': 'hora de Costa Rica',
      'og.more': 'Mapa en vivo y detalles en Sismo.',
      'og.siteSub': 'Mapa de sismos en vivo',
      'og.siteLine': 'Costa Rica y el mundo · datos del OVSICORI, la RSN-UCR, el EMSC y el USGS',
      'og.data': ({ agency }) => `Datos: ${agency}`,
      'og.mag': 'Magnitud',
    },
  };

  const EVTYPES = {
    es: {
      'earthquake': 'Sismo', 'suspected earthquake': 'Posible sismo', 'explosion': 'Explosión',
      'suspected explosion': 'Posible explosión', 'nuclear explosion': 'Explosión nuclear',
      'suspected nuclear explosion': 'Posible explosión nuclear', 'landslide': 'Deslizamiento',
      'quarry blast': 'Voladura en cantera', 'mining explosion': 'Explosión minera',
      'ice quake': 'Sismo glaciar', 'rock burst': 'Estallido de roca', 'other event': 'Otro evento',
    },
  };

  let lang = 'en';

  function t(key, vars) {
    const s = STR[lang][key] ?? STR.en[key] ?? key;
    return typeof s === 'function' ? s(vars || {}) : s;
  }

  function evtype(key) {
    const k = (key || 'earthquake').toLowerCase();
    return EVTYPES[lang]?.[k] || k[0].toUpperCase() + k.slice(1);
  }

  // Prefer the visitor's own regional variant (es-CR, es-MX, en-GB…) for dates and numbers.
  function locale() {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const own = (nav.languages || [nav.language]).find(l => l && l.toLowerCase().startsWith(lang));
    return own || (lang === 'es' ? 'es-CR' : 'en-US');
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.desc'));
  }

  function setLang(l) {
    lang = STR[l] ? l : 'en';
    if (typeof document !== 'undefined') apply(); // also runs under Node in the build script
  }

  // ---------------------------------------------------------------- place names
  /* EMSC uses Flynn-Engdahl region names ("OFF COAST OF COSTA RICA") and USGS uses
     "12 km SW of Jacó, Costa Rica". Translate the common shapes and country names;
     anything unrecognised is left as is. */
  const NAMES = {
    'Panama': 'Panamá', 'Mexico': 'México', 'Peru': 'Perú', 'Belize': 'Belice', 'Haiti': 'Haití',
    'Dominican Republic': 'República Dominicana', 'Brazil': 'Brasil', 'Canada': 'Canadá',
    'United States': 'Estados Unidos', 'Hawaii': 'Hawái', 'Japan': 'Japón', 'Philippines': 'Filipinas',
    'Philippine Islands': 'Islas Filipinas', 'Taiwan': 'Taiwán', 'Russia': 'Rusia', 'Turkey': 'Turquía',
    'Türkiye': 'Turquía', 'Greece': 'Grecia', 'Italy': 'Italia', 'Spain': 'España', 'Germany': 'Alemania',
    'France': 'Francia', 'Switzerland': 'Suiza', 'Iceland': 'Islandia', 'Crete': 'Creta', 'Sicily': 'Sicilia',
    'Morocco': 'Marruecos', 'Algeria': 'Argelia', 'Iran': 'Irán', 'Iraq': 'Irak', 'Afghanistan': 'Afganistán',
    'Pakistan': 'Pakistán', 'Tajikistan': 'Tayikistán', 'Kyrgyzstan': 'Kirguistán', 'Kazakhstan': 'Kazajistán',
    'Papua New Guinea': 'Papúa Nueva Guinea', 'New Zealand': 'Nueva Zelanda', 'Fiji': 'Fiyi',
    'Solomon Islands': 'Islas Salomón', 'Kermadec Islands': 'Islas Kermadec', 'Aleutian Islands': 'Islas Aleutianas',
    'Andreanof Islands': 'Islas Andreanof', 'Fox Islands': 'Islas Fox', 'Rat Islands': 'Islas Rat',
    'Kuril Islands': 'Islas Kuriles', 'Mariana Islands': 'Islas Marianas', 'Galapagos Islands': 'Islas Galápagos',
    'Canary Islands': 'Islas Canarias', 'Virgin Islands': 'Islas Vírgenes', 'Mid-Atlantic Ridge': 'Dorsal Mesoatlántica',
    'East Pacific Rise': 'Dorsal del Pacífico Oriental', 'Caribbean Sea': 'Mar Caribe', 'Cayman Islands': 'Islas Caimán',
    'Southern Alaska': 'Sur de Alaska', 'Central California': 'Centro de California',
    'Northern California': 'Norte de California', 'Southern California': 'Sur de California',
    'Easter Island': 'Isla de Pascua', 'South Sandwich Islands': 'Islas Sandwich del Sur',
    'Tonga Islands': 'Islas Tonga', 'Vanuatu Islands': 'Islas Vanuatu', 'Samoa Islands': 'Islas Samoa',
    'Indian Ocean': 'Océano Índico', 'Pacific Ocean': 'Océano Pacífico', 'Atlantic Ocean': 'Océano Atlántico',
    'Guam': 'Guam', 'Myanmar': 'Birmania', 'Egypt': 'Egipto', 'Cyprus': 'Chipre', 'Romania': 'Rumania',
    'Albania': 'Albania', 'Croatia': 'Croacia', 'Serbia': 'Serbia', 'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
    'Portugal': 'Portugal', 'Azores Islands': 'Islas Azores', 'Svalbard': 'Svalbard', 'Norway': 'Noruega',
    'Fiji Islands': 'Islas Fiyi', 'Dodecanese Islands': 'Islas del Dodecaneso', 'Aegean Sea': 'Mar Egeo',
    'Ionian Sea': 'Mar Jónico', 'Adriatic Sea': 'Mar Adriático', 'Molucca Sea': 'Mar de las Molucas',
    'Philippine Sea': 'Mar de Filipinas', 'Sea of Okhotsk': 'Mar de Ojotsk', 'Sea of Japan': 'Mar de Japón',
    'Gulf of California': 'Golfo de California', 'Gulf of Mexico': 'Golfo de México',
    'Revilla Gigedo Islands': 'Islas Revillagigedo', 'Leeward Islands': 'Islas de Sotavento',
    'Windward Islands': 'Islas de Barlovento', 'Mona Passage': 'Canal de la Mona', 'Puerto Rico Region': 'Región de Puerto Rico',
  };
  const DIR = {
    Northern: 'Norte', Southern: 'Sur', Eastern: 'Este', Western: 'Oeste', Central: 'Centro',
    Northeastern: 'Noreste', Northwestern: 'Noroeste', Southeastern: 'Sureste', Southwestern: 'Suroeste',
    North: 'norte', South: 'sur', East: 'este', West: 'oeste',
    Northeast: 'noreste', Northwest: 'noroeste', Southeast: 'sureste', Southwest: 'suroeste',
    N: 'norte', S: 'sur', E: 'este', W: 'oeste', Ne: 'noreste', Nw: 'noroeste', Se: 'sureste', Sw: 'suroeste',
  };
  const NAME_RE = new RegExp(`\\b(${Object.keys(NAMES).sort((a, b) => b.length - a.length).map(k => k.replace(/[-.]/g, '\\$&')).join('|')})\\b`, 'g');
  const wordSwap = s => s.replace(NAME_RE, m => NAMES[m]);

  const PATTERNS = [
    [/^(Off|Near)(?: the)? (?:(\w+) )?Coast of (.+)$/, (m, where, dir, rest) =>
      `${where === 'Off' ? 'Frente a' : 'Cerca de'} la costa${dir && DIR[dir] ? ' ' + DIR[dir].toLowerCase() : ''} de ${seg(rest)}`],
    [/^(.+) Border Region$/, (m, a) => `Región fronteriza ${seg(a)}`],
    [/^(North|South|East|West|Northeast|Northwest|Southeast|Southwest) of (.+)$/, (m, d, a) => `Al ${DIR[d]} de ${seg(a)}`],
    [/^(Northern|Southern|Eastern|Western|Central|Northeastern|Northwestern|Southeastern|Southwestern) (.+)$/, (m, d, a) => `${DIR[d]} de ${seg(a)}`],
    [/^(.+) Region$/, (m, a) => `Región de ${seg(a)}`],
    [/^Island of (.+)$/, (m, a) => `Isla de ${seg(a)}`],
    [/^(.+) Islands$/, (m, a) => `Islas ${seg(a)}`],
    [/^Gulf of (.+)$/, (m, a) => `Golfo de ${seg(a)}`],
    [/^(.+) Peninsula$/, (m, a) => `Península de ${seg(a)}`],
    [/^(.+) Sea$/, (m, a) => `Mar de ${seg(a)}`],
  ];

  function seg(s) {
    if (NAMES[s]) return NAMES[s];
    for (const [re, fn] of PATTERNS) if (re.test(s)) return s.replace(re, fn);
    return wordSwap(s);
  }

  function place(s) {
    if (lang !== 'es' || !s) return s;
    // USGS: "12 km SSW of Jacó, Costa Rica" (Spanish uses O for oeste)
    const d = s.match(/^(\d+(?:\.\d+)?) km ([NSEW]{1,3}) of (.+)$/);
    if (d) return `${d[1]} km al ${d[2].replace(/W/g, 'O')} de ${place(d[3])}`;
    return tidy(s.split(', ').map(seg).join(', '));
  }

  // Spanish contractions and articles: "de Norte de Chile" → "del norte de Chile", "de Islas" → "de las Islas".
  const tidy = s => s
    .replace(/\bde (Norte|Sur|Este|Oeste|Centro|Noreste|Noroeste|Sureste|Suroeste) de\b/g, (m, d) => `del ${d.toLowerCase()} de`)
    .replace(/\bde Islas\b/g, 'de las islas')
    .replace(/\bde Región\b/g, 'de la región')
    .replace(/\bde Mar\b/g, 'del mar')
    .replace(/\bde Golfo\b/g, 'del golfo');

  return { t, evtype, place, locale, apply, setLang, get lang() { return lang; }, langs: Object.keys(STR) };
})();
