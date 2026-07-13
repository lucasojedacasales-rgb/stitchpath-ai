const TOKEN_ROLE_MAP = Object.freeze({
  background: 'background',
  backdrop: 'background',
  body: 'primary_shape',
  character: 'primary_shape',
  object: 'primary_shape',
  face: 'secondary_shape',
  belly: 'secondary_shape',
  foot: 'secondary_shape',
  feet: 'secondary_shape',
  arm: 'secondary_shape',
  hand: 'secondary_shape',
  accent: 'secondary_shape',
  shadow: 'secondary_shape',
  eye: 'internal_feature',
  eyes: 'internal_feature',
  pupil: 'internal_feature',
  mouth: 'internal_feature',
  nose: 'internal_feature',
  nostril: 'internal_feature',
  cheek: 'internal_feature',
  detail: 'internal_feature',
  highlight: 'highlight',
  negative: 'negative_space',
  negativespace: 'negative_space',
  hole: 'negative_space',
  cutout: 'negative_space',
  void: 'negative_space',
  stroke: 'dark_mark',
  line: 'dark_mark',
  darkmark: 'dark_mark',
  darkdetail: 'dark_mark',
});

const NEGATIVE_FLAG_KEYS = new Set(['negativespace', 'isnegativespace', 'cutout', 'iscutout', 'void', 'isvoid', 'hole', 'ishole']);

function flattenSourceValues(region) {
  return [
    region?.semanticRole,
    region?.source?.name,
    region?.source?.object,
    region?.source?.objectGroup,
    region?.source?.regionClass,
    region?.source?.originalSource,
  ];
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, output));
  return output;
}

function tokensOf(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function hasExplicitNegativeFlag(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (NEGATIVE_FLAG_KEYS.has(normalizedKey) && nested === true) return true;
    return nested && typeof nested === 'object' ? hasExplicitNegativeFlag(nested) : false;
  });
}

export function analyzeSourceSemanticEvidence(region) {
  const exactSourceValues = flattenSourceValues(region).map(value => value === undefined ? null : value);
  const strings = exactSourceValues.flatMap(value => collectStrings(value));
  const matched = [];
  strings.forEach(value => {
    tokensOf(value).forEach(token => {
      const role = TOKEN_ROLE_MAP[token];
      if (role) matched.push({ token, role, value });
    });
  });
  const explicitNegative = hasExplicitNegativeFlag(region?.source)
    || ['negative_space', 'hole', 'cutout', 'void'].includes(String(region?.semanticRole || '').toLowerCase());
  if (explicitNegative) matched.push({ token: 'explicit_negative_space', role: 'negative_space', value: true });
  const roles = [...new Set(matched.map(item => item.role))];
  const conflicts = roles.length > 1 ? roles.map(role => ({ code: 'CONFLICTING_SOURCE_ROLE', role })) : [];
  let trustedRoleCandidate = null;
  if (explicitNegative) trustedRoleCandidate = 'negative_space';
  else if (roles.length === 1) trustedRoleCandidate = roles[0];
  const semanticTags = [...new Set(matched.map(item => item.token))];
  const evidence = matched.map(item => ({
    code: item.token === 'explicit_negative_space' ? 'EXPLICIT_NEGATIVE_SPACE' : 'CONTROLLED_SOURCE_LABEL',
    message: `Controlled source evidence "${item.token}" supports ${item.role}.`,
    sourceValue: item.value,
    role: item.role,
  }));
  return {
    trustedRoleCandidate,
    semanticTags,
    confidence: explicitNegative ? 1 : (trustedRoleCandidate ? 0.9 : (roles.length > 0 ? 0.45 : 0)),
    evidence,
    conflicts,
    exactSourceValues,
  };
}
