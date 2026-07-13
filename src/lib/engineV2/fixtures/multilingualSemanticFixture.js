const polygon = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]];
const item = (id, regionClass, color = '#55aa66', extra = {}) => ({ id, color, region_class: regionClass, path_points: polygon.map(point => [...point]), source: { fixture: 'synthetic_phase_4_multilingual', ...extra } });

export function createMultilingualSemanticFixture() {
  return [
    item('english-body', 'body'), item('spanish-body', 'cuerpo'), item('english-face', 'face'), item('spanish-face', 'cara'),
    item('english-eye', 'eye', '#111111'), item('english-mouth', 'mouth', '#111111'), item('spanish-eye', 'ojo', '#111111'), item('spanish-mouth', 'boca', '#111111'),
    item('accented-line', 'línea', '#111111'), item('spanish-nose', 'nariz'), item('spanish-cheek', 'mejilla'), item('spanish-foot', 'pie'), item('spanish-hand', 'mano'),
    item('spanish-background', 'fondo', '#ffffff'), item('spanish-highlight', 'brillo', '#ffffff'), item('english-outline', 'outline', '#080808'), item('spanish-outline', 'contorno', '#080808'),
  ];
}

export const UNSAFE_SUBSTRING_FIXTURE = Object.freeze(['handmade', 'backgrounder', 'bodywork', 'eyelash']);
export const COMPOUND_SEMANTIC_FIXTURE = Object.freeze(['outer_outline', 'outer-outline', 'outer outline', 'borde_exterior', 'borde-exterior', 'borde exterior', 'espacio_negativo', 'espacio negativo']);
