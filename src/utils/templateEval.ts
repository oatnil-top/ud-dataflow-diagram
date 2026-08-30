/**
 * Evaluate a template string by substituting ${variable} references from context.
 *
 * This is deliberately NOT JavaScript evaluation. Process-node expressions are
 * imported wholesale from shared .dataflow.json/.dataflow.png files, so running
 * them through eval/new Function would let a shared diagram execute arbitrary
 * code in the app origin. Only plain variable substitution (with dotted paths,
 * e.g. ${user.name}) is supported.
 *
 * @param expression - Template string, e.g., `${name}-${id}`
 * @param context - Object with field values, e.g., { name: "Alice", id: 123 }
 * @returns The substituted string
 */
export function evaluateTemplate(
  expression: string,
  context: Record<string, unknown>
): string {
  return expression.replace(/\$\{([^}]+)\}/g, (match, path: string) => {
    const trimmed = path.trim()
    if (!VARIABLE_PATH_RE.test(trimmed)) {
      return match // leave unrecognized expressions untouched
    }
    let value: unknown = context
    for (const key of trimmed.split('.')) {
      if (value === null || typeof value !== 'object') {
        return match
      }
      value = (value as Record<string, unknown>)[key]
    }
    return value === undefined ? match : String(value)
  })
}

/** Dotted identifier path: `name`, `user.name`, `a.b.c` */
const VARIABLE_PATH_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/

/**
 * Validate a template expression without executing it.
 * Every ${...} placeholder must contain a plain (optionally dotted) variable name.
 */
export function validateTemplate(expression: string): { valid: boolean; error?: string } {
  const regex = /\$\{([^}]*)\}/g
  let match
  while ((match = regex.exec(expression)) !== null) {
    const inner = match[1].trim()
    if (!VARIABLE_PATH_RE.test(inner)) {
      return {
        valid: false,
        error: `Invalid placeholder: \${${match[1]}} — only variable names like \${field} or \${field.child} are supported`,
      }
    }
  }
  // Unclosed placeholder, e.g. `${name`
  if (/\$\{[^}]*$/.test(expression)) {
    return { valid: false, error: 'Unclosed ${...} placeholder' }
  }
  return { valid: true }
}

/**
 * Extract variable names used in a template expression.
 * Looks for ${variableName} patterns.
 */
export function extractVariables(expression: string): string[] {
  const regex = /\$\{([^}]+)\}/g
  const variables: string[] = []
  let match

  while ((match = regex.exec(expression)) !== null) {
    // Extract the variable name (first identifier in the expression)
    const expr = match[1]
    const varMatch = expr.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/)
    if (varMatch) {
      variables.push(varMatch[1])
    }
  }

  return [...new Set(variables)] // Remove duplicates
}
