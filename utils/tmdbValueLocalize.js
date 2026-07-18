const { normalizeLanguage } = require('./tmdbLocale');

const LANGS = ['en', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'no', 'da', 'sv', 'fi'];

function langShort(language) {
  const code = normalizeLanguage(language).split('-')[0].toLowerCase();
  return LANGS.includes(code) ? code : 'en';
}

function pickLabel(table, value, language) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const row = table[raw];
  if (!row) return raw;
  const short = langShort(language);
  return row[short] || row.en || raw;
}

const TV_STATUS = {
  'Returning Series': {
    en: 'Returning Series',
    fr: 'Série en cours',
    de: 'Laufende Serie',
    es: 'Serie en emisión',
    it: 'Serie in corso',
    nl: 'Lopende serie',
    pt: 'Série em exibição',
    no: 'Pågående serie',
    da: 'Igangværende serie',
    sv: 'Pågående serie',
    fi: 'Käynnissä oleva sarja',
  },
  Ended: {
    en: 'Ended',
    fr: 'Terminée',
    de: 'Beendet',
    es: 'Finalizada',
    it: 'Conclusa',
    nl: 'Beëindigd',
    pt: 'Encerrada',
    no: 'Avsluttet',
    da: 'Afsluttet',
    sv: 'Avslutad',
    fi: 'Päättynyt',
  },
  'In Production': {
    en: 'In Production',
    fr: 'En production',
    de: 'In Produktion',
    es: 'En producción',
    it: 'In produzione',
    nl: 'In productie',
    pt: 'Em produção',
    no: 'I produksjon',
    da: 'Under produktion',
    sv: 'Under produktion',
    fi: 'Tuotannossa',
  },
  Planned: {
    en: 'Planned',
    fr: 'Prévue',
    de: 'Geplant',
    es: 'Planificada',
    it: 'Pianificata',
    nl: 'Gepland',
    pt: 'Planeada',
    no: 'Planlagt',
    da: 'Planlagt',
    sv: 'Planerad',
    fi: 'Suunnitteilla',
  },
  Canceled: {
    en: 'Canceled',
    fr: 'Annulée',
    de: 'Abgesetzt',
    es: 'Cancelada',
    it: 'Annullata',
    nl: 'Geannuleerd',
    pt: 'Cancelada',
    no: 'Avlyst',
    da: 'Aflyst',
    sv: 'Inställd',
    fi: 'Peruttu',
  },
  Pilot: {
    en: 'Pilot',
    fr: 'Pilote',
    de: 'Pilot',
    es: 'Piloto',
    it: 'Pilota',
    nl: 'Pilot',
    pt: 'Piloto',
    no: 'Pilot',
    da: 'Pilot',
    sv: 'Pilot',
    fi: 'Pilotti',
  },
};

const MOVIE_STATUS = {
  Released: {
    en: 'Released',
    fr: 'Sorti',
    de: 'Veröffentlicht',
    es: 'Estrenada',
    it: 'Uscito',
    nl: 'Uitgebracht',
    pt: 'Lançado',
    no: 'Utgitt',
    da: 'Udgivet',
    sv: 'Utgiven',
    fi: 'Julkaistu',
  },
  Rumored: {
    en: 'Rumored',
    fr: 'Rumeur',
    de: 'Gerücht',
    es: 'Rumor',
    it: 'Voce',
    nl: 'Gerucht',
    pt: 'Rumor',
    no: 'Rykte',
    da: 'Rygte',
    sv: 'Rykte',
    fi: 'Huhu',
  },
  Planned: TV_STATUS.Planned,
  'In Production': TV_STATUS['In Production'],
  'Post Production': {
    en: 'Post Production',
    fr: 'Post-production',
    de: 'Postproduktion',
    es: 'Postproducción',
    it: 'Post-produzione',
    nl: 'Postproductie',
    pt: 'Pós-produção',
    no: 'Etterproduksjon',
    da: 'Efterproduktion',
    sv: 'Efterproduktion',
    fi: 'Jälkituotanto',
  },
  Canceled: TV_STATUS.Canceled,
};

const TV_TYPE = {
  Scripted: {
    en: 'Scripted',
    fr: 'Scénarisée',
    de: 'Scripted',
    es: 'Con guion',
    it: 'Sceneggiata',
    nl: 'Scripted',
    pt: 'Roteirizada',
    no: 'Manus',
    da: 'Manuskript',
    sv: 'Manusbaserad',
    fi: 'Käsikirjoitettu',
  },
  Documentary: {
    en: 'Documentary',
    fr: 'Documentaire',
    de: 'Dokumentation',
    es: 'Documental',
    it: 'Documentario',
    nl: 'Documentaire',
    pt: 'Documentário',
    no: 'Dokumentar',
    da: 'Dokumentar',
    sv: 'Dokumentär',
    fi: 'Dokumentti',
  },
  News: {
    en: 'News',
    fr: 'Actualités',
    de: 'Nachrichten',
    es: 'Noticias',
    it: 'Notizie',
    nl: 'Nieuws',
    pt: 'Notícias',
    no: 'Nyheter',
    da: 'Nyheder',
    sv: 'Nyheter',
    fi: 'Uutiset',
  },
  Reality: {
    en: 'Reality',
    fr: 'Télé-réalité',
    de: 'Reality',
    es: 'Reality',
    it: 'Reality',
    nl: 'Reality',
    pt: 'Reality',
    no: 'Reality',
    da: 'Reality',
    sv: 'Reality',
    fi: 'Reality',
  },
  'Talk Show': {
    en: 'Talk Show',
    fr: 'Talk-show',
    de: 'Talkshow',
    es: 'Talk show',
    it: 'Talk show',
    nl: 'Talkshow',
    pt: 'Talk show',
    no: 'Talkshow',
    da: 'Talkshow',
    sv: 'Talkshow',
    fi: 'Talk show',
  },
  Miniseries: {
    en: 'Miniseries',
    fr: 'Mini-série',
    de: 'Miniserie',
    es: 'Miniserie',
    it: 'Miniserie',
    nl: 'Miniserie',
    pt: 'Minissérie',
    no: 'Miniserie',
    da: 'Miniserie',
    sv: 'Miniserie',
    fi: 'Minisarja',
  },
  Video: {
    en: 'Video',
    fr: 'Vidéo',
    de: 'Video',
    es: 'Video',
    it: 'Video',
    nl: 'Video',
    pt: 'Vídeo',
    no: 'Video',
    da: 'Video',
    sv: 'Video',
    fi: 'Video',
  },
  Animated: {
    en: 'Animated',
    fr: 'Animation',
    de: 'Animation',
    es: 'Animación',
    it: 'Animazione',
    nl: 'Animatie',
    pt: 'Animação',
    no: 'Animasjon',
    da: 'Animation',
    sv: 'Animerad',
    fi: 'Animaatio',
  },
};

const CREW_JOBS = {
  Director: {
    en: 'Director',
    fr: 'Réalisateur',
    de: 'Regisseur',
    es: 'Director',
    it: 'Regista',
    nl: 'Regisseur',
    pt: 'Realizador',
    no: 'Regissør',
    da: 'Instruktør',
    sv: 'Regissör',
    fi: 'Ohjaaja',
  },
  Creator: {
    en: 'Creator',
    fr: 'Créateur',
    de: 'Schöpfer',
    es: 'Creador',
    it: 'Creatore',
    nl: 'Maker',
    pt: 'Criador',
    no: 'Skaper',
    da: 'Skaber',
    sv: 'Skapare',
    fi: 'Luoja',
  },
  Writer: {
    en: 'Writer',
    fr: 'Scénariste',
    de: 'Autor',
    es: 'Guionista',
    it: 'Sceneggiatore',
    nl: 'Schrijver',
    pt: 'Argumentista',
    no: 'Manusforfatter',
    da: 'Manuskriptforfatter',
    sv: 'Manusförfattare',
    fi: 'Käsikirjoittaja',
  },
  Screenplay: {
    en: 'Screenplay',
    fr: 'Scénario',
    de: 'Drehbuch',
    es: 'Guion',
    it: 'Sceneggiatura',
    nl: 'Scenario',
    pt: 'Argumento',
    no: 'Manus',
    da: 'Manuskript',
    sv: 'Manus',
    fi: 'Käsikirjoitus',
  },
  'Executive Producer': {
    en: 'Executive Producer',
    fr: 'Producteur exécutif',
    de: 'Ausführender Produzent',
    es: 'Productor ejecutivo',
    it: 'Produttore esecutivo',
    nl: 'Uitvoerend producent',
    pt: 'Produtor executivo',
    no: 'Executive producer',
    da: 'Executive producer',
    sv: 'Executive producer',
    fi: 'Executive producer',
  },
  'Original Music Composer': {
    en: 'Original Music Composer',
    fr: 'Compositeur',
    de: 'Komponist',
    es: 'Compositor',
    it: 'Compositore',
    nl: 'Componist',
    pt: 'Compositor',
    no: 'Komponist',
    da: 'Komponist',
    sv: 'Kompositör',
    fi: 'Säveltäjä',
  },
  Producer: {
    en: 'Producer',
    fr: 'Producteur',
    de: 'Produzent',
    es: 'Productor',
    it: 'Produttore',
    nl: 'Producent',
    pt: 'Produtor',
    no: 'Produsent',
    da: 'Producer',
    sv: 'Producent',
    fi: 'Tuottaja',
  },
};

const VIDEO_TYPES = {
  Trailer: {
    en: 'Trailer',
    fr: 'Bande-annonce',
    de: 'Trailer',
    es: 'Tráiler',
    it: 'Trailer',
    nl: 'Trailer',
    pt: 'Trailer',
    no: 'Trailer',
    da: 'Trailer',
    sv: 'Trailer',
    fi: 'Traileri',
  },
  Teaser: {
    en: 'Teaser',
    fr: 'Teaser',
    de: 'Teaser',
    es: 'Teaser',
    it: 'Teaser',
    nl: 'Teaser',
    pt: 'Teaser',
    no: 'Teaser',
    da: 'Teaser',
    sv: 'Teaser',
    fi: 'Teaser',
  },
  'Featurette': {
    en: 'Featurette',
    fr: 'Featurette',
    de: 'Featurette',
    es: 'Featurette',
    it: 'Featurette',
    nl: 'Featurette',
    pt: 'Featurette',
    no: 'Featurette',
    da: 'Featurette',
    sv: 'Featurette',
    fi: 'Featurette',
  },
  'Behind the Scenes': {
    en: 'Behind the Scenes',
    fr: 'Dans les coulisses',
    de: 'Hinter den Kulissen',
    es: 'Detrás de cámaras',
    it: 'Dietro le quinte',
    nl: 'Achter de schermen',
    pt: 'Bastidores',
    no: 'Bak kulissene',
    da: 'Bag kulisserne',
    sv: 'Bakom kulisserna',
    fi: 'Kulissien takana',
  },
};

function localizeMediaStatus(status, tmdbKind, language) {
  const table = tmdbKind === 'movie' ? MOVIE_STATUS : TV_STATUS;
  return pickLabel(table, status, language);
}

function localizeTvType(type, language) {
  return pickLabel(TV_TYPE, type, language);
}

function localizeCrewJob(job, language) {
  return pickLabel(CREW_JOBS, job, language);
}

function localizeVideoType(type, language) {
  return pickLabel(VIDEO_TYPES, type, language);
}

function formatCertification(code, meaning) {
  if (!code) return null;
  if (meaning) return `${code} — ${meaning}`;
  return code;
}

module.exports = {
  localizeMediaStatus,
  localizeTvType,
  localizeCrewJob,
  localizeVideoType,
  formatCertification,
};
