// Source authority: rate where Gemini's grounding sources come from, and check which
// claims in a story are actually backed by a source (via groundingSupports).
//
// Tiers, strongest first:
//   authoritative  official/government, archives, libraries, museums, universities, scholarly encyclopedias
//   reputable      Wikipedia, established news and history publishers
//   unrated        anything we don't recognise
//   low            forums, social media, review sites, user-generated content

export const TIER_RANK = { authoritative: 3, reputable: 2, unrated: 1, low: 0 };

const AUTHORITATIVE = [
  // Government and official bodies
  /(^|\.)gov(\.[a-z]{2})?$/, /(^|\.)gouv\.[a-z]{2}$/, /(^|\.)gc\.ca$/, /(^|\.)admin\.ch$/, /(^|\.)bund\.de$/,
  /(^|\.)gv\.at$/, /(^|\.)go\.[a-z]{2}$/, /(^|\.)europa\.eu$/, /(^|\.)un\.org$/, /(^|\.)unesco\.org$/,
  // Swiss cantons (bs.ch, zh.ch, ...) and city administrations
  /(^|\.)(ag|ai|ar|be|bl|bs|fr|ge|gl|gr|ju|lu|ne|nw|ow|sg|sh|so|sz|tg|ti|ur|vd|vs|zg|zh)\.ch$/,
  /(^|\.)stadt-[a-z-]+\.(ch|de|at)$/, /(^|\.)ville-[a-z-]+\.fr$/,
  // Universities and research
  /(^|\.)edu(\.[a-z]{2})?$/, /(^|\.)ac\.[a-z]{2}$/, /(^|\.)(ethz|epfl|uzh|unibe|unige|unil|usi|tum|lmu|kit|sorbonne-universite|ens)\.(ch|de|fr)$/, /(^|\.)(uni|univ)[a-z-]*\./, /university/, /(^|\.)jstor\.org$/,
  /(^|\.)persee\.fr$/, /(^|\.)cairn\.info$/, /(^|\.)doi\.org$/, /(^|\.)springer\.com$/, /(^|\.)cambridge\.org$/, /(^|\.)(brill\.com|oup\.com|academic\.oup\.com|tandfonline\.com|wiley\.com|sciencedirect\.com|degruyter\.com|muse\.jhu\.edu|journals\.openedition\.org)$/,
  // Archives, libraries, museums, heritage
  /(^|\.)museum$/, /muse(um|o|e)/, /archiv/, /bibliot/, /librar/, /(^|\.)loc\.gov$/, /(^|\.)bl\.uk$/,
  /(^|\.)bnf\.fr$/, /(^|\.)europeana\.eu$/, /(^|\.)e-rara\.ch$/, /(^|\.)e-codices\.ch$/, /(^|\.)si\.edu$/,
  /(^|\.)smithsonianmag\.com$/, /heritage/, /(^|\.)historicengland\.org\.uk$/, /(^|\.)nps\.gov$/,
  // Scholarly encyclopedias and national biographies
  /(^|\.)britannica\.com$/, /(^|\.)hls-dhs-dss\.ch$/, /(^|\.)deutsche-biographie\.de$/, /(^|\.)oxforddnb\.com$/,
  /(^|\.)treccani\.it$/, /(^|\.)larousse\.fr$/, /(^|\.)snl\.no$/, /(^|\.)ne\.se$/,
];

const REPUTABLE = [
  /(^|\.)wikipedia\.org$/, /(^|\.)wikisource\.org$/, /(^|\.)wikimedia\.org$/,
  /(^|\.)bbc\.(co\.uk|com)$/, /(^|\.)theguardian\.com$/, /(^|\.)nytimes\.com$/, /(^|\.)washingtonpost\.com$/,
  /(^|\.)reuters\.com$/, /(^|\.)apnews\.com$/, /(^|\.)npr\.org$/, /(^|\.)pbs\.org$/, /(^|\.)economist\.com$/,
  /(^|\.)theatlantic\.com$/, /(^|\.)newyorker\.com$/, /(^|\.)time\.com$/, /(^|\.)nationalgeographic\.com$/,
  /(^|\.)history\.com$/, /(^|\.)historytoday\.com$/, /(^|\.)atlasobscura\.com$/, /(^|\.)dw\.com$/,
  /(^|\.)swissinfo\.ch$/, /(^|\.)nzz\.ch$/, /(^|\.)srf\.ch$/, /(^|\.)rts\.ch$/, /(^|\.)spiegel\.de$/,
  /(^|\.)zeit\.de$/, /(^|\.)faz\.net$/, /(^|\.)lemonde\.fr$/, /(^|\.)lefigaro\.fr$/, /(^|\.)elpais\.com$/,
  /(^|\.)corriere\.it$/, /(^|\.)france24\.com$/, /(^|\.)euronews\.com$/, /(^|\.)aljazeera\.com$/,
];

const LOW = [
  /(^|\.)tripadvisor\./, /(^|\.)reddit\.com$/, /(^|\.)quora\.com$/, /(^|\.)pinterest\./, /(^|\.)facebook\.com$/,
  /(^|\.)instagram\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)youtube\.com$/, /(^|\.)(x|twitter)\.com$/,
  /(^|\.)medium\.com$/, /blogspot\./, /(^|\.)wordpress\.com$/, /(^|\.)fandom\.com$/, /(^|\.)wikihow\.com$/,
  /(^|\.)answers\./, /(^|\.)yelp\./, /(^|\.)booking\.com$/, /(^|\.)expedia\./, /blog/,
];

export const TIER_LABEL = {
  authoritative: 'Authoritative',
  reputable: 'Reputable',
  unrated: 'Unrated',
  low: 'Low authority',
};

const looksLikeDomain = (s) => typeof s === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim());

/** Best-effort real domain of a grounding chunk (uri is often a Google redirect URL). */
export function domainOf(web = {}) {
  if (looksLikeDomain(web.domain)) return web.domain.toLowerCase();
  if (looksLikeDomain(web.title)) return web.title.toLowerCase();
  try {
    const host = new URL(web.uri).hostname.toLowerCase();
    if (!host.includes('vertexaisearch') && !host.endsWith('google.com')) return host;
  } catch {
    /* not a URL */
  }
  return '';
}

export function tierOf(domain) {
  const d = (domain || '').replace(/^www\./, '');
  if (!d) return 'unrated';
  if (LOW.some((r) => r.test(d))) return 'low';
  if (AUTHORITATIVE.some((r) => r.test(d))) return 'authoritative';
  if (REPUTABLE.some((r) => r.test(d))) return 'reputable';
  return 'unrated';
}

const tokens = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 || /\d/.test(t));



const best = (tiers) => tiers.reduce((a, t) => (a == null || TIER_RANK[t] > TIER_RANK[a] ? t : a), null);


const strongTier = (t) => t === 'authoritative' || t === 'reputable';

function chunkInfoOf(groundingMetadata) {
  return (groundingMetadata?.groundingChunks ?? []).map((c) => {
    const domain = domainOf(c.web);
    return { uri: c.web?.uri ?? '', title: c.web?.title || domain || 'Source', domain, tier: tierOf(domain), cited: false };
  });
}

/** Sentences of `text` with their character spans. */
function sentenceSpans(text) {
  const out = [];
  const re = /[^.!?\n]+(?:[.!?]+["”’)]*|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (tokens(t).length >= 4) out.push({ text: t, start: m.index + lead, end: m.index + lead + t.length });
    if (!raw.length) re.lastIndex++;
  }
  return out;
}

/**
 * Rates each sentence of a grounded research brief by the strongest source cited for it,
 * using the citation character spans (precise, unlike text matching).
 */
export function rateResearch({ groundingMetadata, text }) {
  const chunkInfo = chunkInfoOf(groundingMetadata);
  const supports = (groundingMetadata?.groundingSupports ?? []).filter((s) => Number.isFinite(s.segment?.startIndex) && s.segment?.text);
  const sentences = sentenceSpans(text).map((s, i) => {
    const idx = new Set();
    for (const sup of supports) {
      const a = sup.segment.startIndex;
      const b = a + sup.segment.text.length;
      if (b - a > 600) continue; // citations spanning whole blocks say little about any one sentence
      const overlap = Math.min(b, s.end) - Math.max(a, s.start);
      if (overlap > 0 && overlap / Math.min(b - a, s.end - s.start) >= 0.5) (sup.groundingChunkIndices ?? []).forEach((k) => idx.add(k));
    }
    const hits = [...idx].filter((k) => chunkInfo[k]);
    hits.forEach((k) => (chunkInfo[k].cited = true));
    return { n: i + 1, text: s.text, tier: best(hits.map((k) => chunkInfo[k].tier)) };
  });
  return { sentences, chunkInfo, linked: supports.length > 0 };
}

/** Ranked source list, kept facts and the story-level verdict. */
export function summarize({ chunkInfo, linked, claimTiers, facts }) {
  const keptFacts = linked ? facts.filter((f) => f.backing) : facts.map((f) => ({ ...f, backing: 'unlinked' }));

  const seen = new Set();
  const sources = chunkInfo
    .filter((s) => s.uri && !seen.has(s.uri) && seen.add(s.uri))
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || Number(b.cited) - Number(a.cited))
    .slice(0, 8)
    .map((s) => ({ ...s, label: TIER_LABEL[s.tier] }));
  const hasStrongSource = sources.some((s) => strongTier(s.tier));

  let level;
  let coverage = null;
  let note;
  if (!sources.length) {
    level = 'weak';
    note = 'No sources were returned, so nothing here could be checked. Treat as unverified.';
  } else if (!linked || !claimTiers.length) {
    level = hasStrongSource ? 'mixed' : 'weak';
    note = hasStrongSource
      ? 'Drawn from reputable sources, but individual claims are not linked to them.'
      : 'Only unrated or low-authority sources were found. Treat as unverified.';
  } else {
    coverage = claimTiers.filter(Boolean).length / claimTiers.length;
    const strongCoverage = claimTiers.filter((t) => t && strongTier(t)).length / claimTiers.length;
    const pct = Math.round(coverage * 100);
    const strongPct = Math.round(strongCoverage * 100);
    if (strongCoverage >= 0.6) level = 'strong';
    else if (coverage >= 0.4 && hasStrongSource) level = 'mixed';
    else level = 'weak';
    note =
      level === 'strong'
        ? `${strongPct}% of the claims are backed by authoritative or reputable sources.`
        : level === 'mixed'
          ? `${pct}% of the claims are backed by sources, but only ${strongPct}% by authoritative or reputable ones.`
          : `Only ${strongPct}% of the claims are backed by authoritative or reputable sources. Treat as unverified.`;
  }

  return { sources, facts: keptFacts, droppedFacts: facts.length - keptFacts.length, authority: { level, coverage, note } };
}

/**
 * For prose (e.g. spoken answers): rate every sentence and summarise.
 */
export function assessAuthority({ groundingMetadata, text }) {
  const r = rateResearch({ groundingMetadata, text });
  return summarize({ chunkInfo: r.chunkInfo, linked: r.linked, claimTiers: r.sentences.map((s) => s.tier), facts: [] });
}

/** Facts written from the brief carry the numbers of the brief sentences they came from. */
export function rateFacts(facts, sentences) {
  return facts.map((f) => ({
    text: f.text,
    backing: best((f.from ?? []).map((n) => sentences[n - 1]?.tier).filter(Boolean)),
  }));
}
