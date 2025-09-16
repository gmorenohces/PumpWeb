// --- Tipos
export type PresetKey =
  | 'studio_premium' | 'locker_grit' | 'sport_performance' | 'neon_gym'
  | 'luxe_minimal'   | 'beach_gold'  | 'urban_editorial'   | 'bn_sculpt'
  | 'color_pop'      | 'cozy_lifestyle';

export interface Preset {
  key: PresetKey;
  label: string;   // texto visible en el chip
  hint: string;    // tooltip
  snippet: string; // se agrega al prompt
}

// --- Lista oficial de presets PUMP
export const PRESETS: Preset[] = [
  {
    key: 'studio_premium',
    label: 'Estudio atlético premium',
    hint: 'Luz suave key+fill, piel impecable, foco en cinturilla PUMP',
    snippet: 'premium studio lighting, soft key and fill, crisp skin texture, hero product waistband in focus'
  },
  {
    key: 'locker_grit',
    label: 'Locker room grit',
    hint: 'Vestuario deportivo, textura cruda, actitud competitiva',
    snippet: 'locker room ambiance, gritty texture, competitive attitude, chalk dust atmosphere'
  },
  {
    key: 'sport_performance',
    label: 'Rendimiento deportivo',
    hint: 'Movimiento, fibra marcada, energía y sudor controlado',
    snippet: 'dynamic athletic pose, defined muscle fibers, controlled sweat highlights, sense of motion'
  },
  {
    key: 'neon_gym',
    label: 'Neón gimnasio',
    hint: 'Gimnasio nocturno, acentos neón magenta/teal',
    snippet: 'night gym scene, neon magenta and teal accents, cinematic contrast'
  },
  {
    key: 'luxe_minimal',
    label: 'Luxe minimal',
    hint: 'Fondo limpio, composición elegante, alto valor',
    snippet: 'minimal luxury composition, clean background, high-end fashion aesthetic'
  },
  {
    key: 'beach_gold',
    label: 'Playa golden hour',
    hint: 'Atardecer cálido, piel dorada, brisa marina',
    snippet: 'sun-kissed golden hour light, warm tones, subtle sea breeze mood'
  },
  {
    key: 'urban_editorial',
    label: 'Editorial urbano',
    hint: 'Ciudad, líneas arquitectónicas, look editorial',
    snippet: 'urban editorial mood, architectural lines, fashion-forward posing'
  },
  {
    key: 'bn_sculpt',
    label: 'B/N escultura',
    hint: 'Blanco y negro, sombras esculpidas, clásico',
    snippet: 'black and white, sculpted shadow play, timeless classic look'
  },
  {
    key: 'color_pop',
    label: 'Color pop fashion',
    hint: 'Colores vivos, contraste alto, impacto visual',
    snippet: 'bold color pop, high contrast, vibrant fashion impact'
  },
  {
    key: 'cozy_lifestyle',
    label: 'Lifestyle acogedor',
    hint: 'Interior cálido, natural, cercanía aspiracional',
    snippet: 'cozy lifestyle interior, natural warmth, intimate aspirational mood'
  }
];

// --- Helper para componer prompt final con presets
export function applyPresetsToPrompt(basePrompt: string, selected: PresetKey[]): string {
  if (!selected?.length) return basePrompt?.trim();
  const extra = PRESETS
    .filter(p => selected.includes(p.key))
    .map(p => p.snippet)
    .join(', ');
  return extra ? `${(basePrompt || '').trim()} — ${extra}` : (basePrompt || '').trim();
}
