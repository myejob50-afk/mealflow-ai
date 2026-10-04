const UNIT_WORDS = new Set([
  'g',
  'kg',
  'ml',
  'l',
  'pc',
  'pcs',
  'clove',
  'cloves',
  'slice',
  'slices',
  'cup',
  'cups',
  'tbsp',
  'tsp',
])

const IRREGULAR: Record<string, string> = {
  eggs: 'egg',
  cloves: 'clove',
  tomatoes: 'tomato',
  potatoes: 'potato',
  leaves: 'leaf',
  berries: 'berry',
  sauces: 'sauce',
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function singularize(word: string): string {
  const irregular = IRREGULAR[word]
  if (irregular) return irregular
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('ses') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

export function canonicalFoodName(value: string): string {
  return normalizeName(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
    .filter((token) => !UNIT_WORDS.has(token))
    .join(' ')
}

export function namesMatch(a: string, b: string): boolean {
  const left = canonicalFoodName(a)
  const right = canonicalFoodName(b)
  return Boolean(left) && left === right
}
