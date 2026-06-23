/**
 * Safe JOIN Debugger
 * Previene errores "Cannot read properties of undefined (reading 'join')"
 * con logs exhaustivos y fallback automático
 */

export const JoinDebugger = {
  errors: [],
  
  safeJoin(array, separator = '', context = {}) {
    // Validación básica
    if (Array.isArray(array)) {
      return array.join(separator);
    }

    // Registrar error exhaustivo
    const error = {
      timestamp: new Date().toISOString(),
      file: context.file || 'UNKNOWN',
      function: context.function || 'UNKNOWN',
      line: context.line || 'UNKNOWN',
      variable: context.variable || 'UNKNOWN',
      value: array,
      type: typeof array,
      isNull: array === null,
      isUndefined: array === undefined,
      regionName: context.regionName || 'N/A',
      regionIndex: context.regionIndex || 'N/A',
      stackTrace: context.stackTrace || ''
    };

    this.errors.push(error);

    // Log a consola (Deno backend o browser)
    console.error('🔴 JOIN SAFETY ERROR', {
      variable: context.variable || 'UNKNOWN',
      received: array,
      type: typeof array,
      context: context.function,
      file: context.file,
      line: context.line,
      regionName: context.regionName
    });

    // Fallback
    return '';
  },

  // Wrapper para .join() en arrays
  wrapArray(array, separator = '', context = {}) {
    return this.safeJoin(array, separator, context);
  },

  // Validar antes de usar
  validateAndJoin(array, separator = '', context = {}) {
    if (!Array.isArray(array)) {
      console.warn(`⚠️ Non-array passed to join: ${context.variable || 'unknown'}`, {
        value: array,
        type: typeof array
      });
      return '';
    }

    if (array.length === 0) {
      console.info(`ℹ️ Empty array joined: ${context.variable || 'unknown'}`);
    }

    return array.join(separator);
  },

  // Generar informe completo
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalErrors: this.errors.length,
      errorsByFile: {},
      errorsByFunction: {},
      errorsByVariable: {},
      errorDetails: this.errors
    };

    // Agrupar por archivo
    for (const err of this.errors) {
      if (!report.errorsByFile[err.file]) {
        report.errorsByFile[err.file] = [];
      }
      report.errorsByFile[err.file].push(err);

      if (!report.errorsByFunction[err.function]) {
        report.errorsByFunction[err.function] = [];
      }
      report.errorsByFunction[err.function].push(err);

      if (!report.errorsByVariable[err.variable]) {
        report.errorsByVariable[err.variable] = [];
      }
      report.errorsByVariable[err.variable].push(err);
    }

    return report;
  },

  // Limpiar historial
  clear() {
    this.errors = [];
  },

  // Exportar para inspección
  export() {
    return JSON.stringify(this.generateReport(), null, 2);
  }
};

export default JoinDebugger;