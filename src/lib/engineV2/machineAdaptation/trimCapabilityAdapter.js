export function adaptTrimCommandForMachineProfile({ canonicalCommand, profile, config }) {
  const warnings = []; const errors = [];
  if (profile.trimCapability === 'intent_only') warnings.push({ code: 'TRIM_INTENT_REQUIRES_ENCODER_OR_MACHINE_INTERPRETATION', canonicalCommandId: canonicalCommand.id });
  if (profile.trimCapability === 'unsupported') {
    if (profile.unsupportedTrimPolicy === 'block' || config.blockUnsupportedTrim) errors.push({ code: 'UNSUPPORTED_TRIM_BLOCKED', canonicalCommandId: canonicalCommand.id });
    else warnings.push({ code: 'TRIM_UNSUPPORTED_BUT_INTENT_PRESERVED', canonicalCommandId: canonicalCommand.id });
  }
  if (profile.trimCapability === 'unknown') warnings.push({ code: 'TRIM_CAPABILITY_UNKNOWN_INTENT_PRESERVED', canonicalCommandId: canonicalCommand.id });
  return { valid: errors.length === 0, preserve: true, canonicalCommand, warnings, errors };
}
