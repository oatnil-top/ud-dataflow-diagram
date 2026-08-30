import type { Field } from '../types'
import { generateId } from '../types'

/**
 * Infer the type string from a JavaScript value
 */
function inferType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array'
    const itemType = inferType(value[0])
    return `${itemType}[]`
  }
  return typeof value
}

/**
 * Parse a JSON object into a nested/hierarchical field structure.
 * Objects become parent fields with children, preserving the visual hierarchy.
 */
export function parseJsonToFields(
  obj: unknown,
  parentPath: string[] = []
): Field[] {
  const fields: Field[] = []

  if (obj === null || typeof obj !== 'object') {
    // Primitive at root level
    return [{
      id: generateId(),
      name: 'value',
      path: parentPath.length > 0 ? parentPath : ['value'],
      type: inferType(obj),
      example: obj,
    }]
  }

  if (Array.isArray(obj)) {
    // Array at current level - show as array field
    if (obj.length === 0) {
      return [{
        id: generateId(),
        name: '[]',
        path: [...parentPath, '[]'],
        type: 'array',
        example: [],
      }]
    }

    const firstItem = obj[0]

    if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
      // Array of objects - create a parent with nested structure
      const children = parseJsonToFields(firstItem, [...parentPath, '[]'])
      // Update examples to show all array values
      updateArrayExamples(children, obj, parentPath.length + 1)

      return [{
        id: generateId(),
        name: '[]',
        path: [...parentPath, '[]'],
        type: 'object[]',
        example: obj,
        children,
      }]
    } else {
      // Array of primitives
      return [{
        id: generateId(),
        name: '[]',
        path: [...parentPath, '[]'],
        type: inferType(firstItem) + '[]',
        example: obj,
      }]
    }
  }

  // Object - iterate over keys
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...parentPath, key]

    if (value === null || typeof value !== 'object') {
      // Primitive value - leaf field
      fields.push({
        id: generateId(),
        name: key,
        path: currentPath,
        type: inferType(value),
        example: value,
      })
    } else if (Array.isArray(value)) {
      // Array value
      if (value.length === 0) {
        fields.push({
          id: generateId(),
          name: key,
          path: currentPath,
          type: 'array',
          example: [],
        })
      } else {
        const firstItem = value[0]
        if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
          // Array of objects
          const children = parseJsonToFields(firstItem, [...currentPath, '[]'])
          updateArrayExamples(children, value, currentPath.length + 1)
          fields.push({
            id: generateId(),
            name: key,
            path: currentPath,
            type: 'object[]',
            example: value,
            children,
          })
        } else {
          // Array of primitives
          fields.push({
            id: generateId(),
            name: key,
            path: currentPath,
            type: inferType(firstItem) + '[]',
            example: value,
          })
        }
      }
    } else {
      // Nested object - create parent with children
      const children = parseJsonToFields(value, currentPath)
      fields.push({
        id: generateId(),
        name: key,
        path: currentPath,
        type: 'object',
        example: value,
        children,
      })
    }
  }

  return fields
}

/**
 * Update examples for array children to show values from all array items
 */
function updateArrayExamples(fields: Field[], arrayData: unknown[], pathOffset: number): void {
  for (const field of fields) {
    const relativePath = field.path.slice(pathOffset)
    field.example = arrayData.map((item) => getValueByPath(item, relativePath))
    if (field.children) {
      updateArrayExamples(field.children, arrayData, pathOffset)
    }
  }
}

/**
 * Get a value from an object by path array
 */
export function getValueByPath(obj: unknown, path: string[]): unknown {
  let current = obj

  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (key === '[]') {
      // Array marker: descend into the first item as the representative
      // sample. Merely skipping the marker would leave `current` pointing at
      // the array, so the next key would index the array object → undefined.
      if (Array.isArray(current)) {
        current = current[0]
      }
      continue
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Set a value in an object by path array
 */
export function setValueByPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current = obj

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (key === '[]') continue

    // Replace missing or primitive intermediates — indexing into a primitive
    // would crash on the next iteration
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  const lastKey = path[path.length - 1]
  if (lastKey !== '[]') {
    current[lastKey] = value
  }
}
