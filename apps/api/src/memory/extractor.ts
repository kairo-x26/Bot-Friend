/**
 * Narrow, rule-based extraction of memory *suggestions* from what the user says
 * about themselves. Nothing extracted here is used until the user approves it.
 * Deliberately conservative: it only recognises a few first-person patterns and
 * never captures sensitive categories.
 */
const SENSITIVE = /\b(password|address|phone|email|ssn|social security|bank|credit card|diagnos|medication|therapy|religio|pregnan|sexual|politic|immigra|lawsuit|salary)\b/i;

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/\bmy name is ([A-Z][a-z]{1,20})\b/, (m) => `Their name is ${m[1]}`],
  [/\bcall me ([A-Z][a-z]{1,20})\b/, (m) => `Likes to be called ${m[1]}`],
  [/\bmy favou?rite ([a-z ]{2,24}?) is ([^.!?,]{2,40})/i, (m) => `Favorite ${m[1]!.trim()}: ${m[2]!.trim()}`],
  [/\bi (?:have|own) an? (dog|cat|bird|rabbit|hamster|parrot|lizard|turtle)(?: named| called) ([A-Z][a-z]{1,20})/i, (m) => `Has a ${m[1]!.toLowerCase()} named ${m[2]}`],
  [/\bi (?:really )?(?:love|enjoy) ([a-z][a-z ]{2,30}?)(?:[.!?,]|$)/i, (m) => `Enjoys ${m[1]!.trim()}`],
  [/\bi(?:'m| am) (?:learning|studying) ([a-z][a-z ]{2,30}?)(?:[.!?,]|$)/i, (m) => `Is learning ${m[1]!.trim()}`],
  [/\bi hate ([a-z][a-z ]{2,30}?) jokes\b/i, (m) => `Doesn’t like ${m[1]!.trim()} jokes`],
];

export function extractMemorySuggestions(text: string): string[] {
  if (text.length > 600 || SENSITIVE.test(text)) return [];
  const out = new Set<string>();
  for (const [re, fmt] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const value = fmt(m).replace(/\s+/g, ' ').trim();
      if (!SENSITIVE.test(value) && value.length <= 120) out.add(value);
    }
  }
  return [...out].slice(0, 2);
}
