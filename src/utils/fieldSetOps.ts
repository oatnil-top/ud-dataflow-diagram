import type { Field } from '../types'
import { generateId } from '../types'

export type SetOperation = 'union' | 'intersection' | 'difference' | 'complement'

/** Symbol labels for each operation */
export const SET_OP_SYMBOLS: Record<SetOperation, string> = {
  union: '\u222A',        // ∪
  intersection: '\u2229', // ∩
  difference: '\u2212',   // −  (A − B)
  complement: '\u2201',   // ∁  (B − A)
}

/** Serialize a field's path for comparison */
function fieldKey(field: Field): string {
  return field.path.join('.')
}

/** Deep-clone a field with fresh IDs */
function cloneField(field: Field): Field {
  return {
    ...field,
    id: generateId(),
    children: field.children ? field.children.map(cloneField) : undefined,
  }
}

/** Build a path→Field map from a field list (top-level only) */
function buildFieldMap(fields: Field[]): Map<string, Field> {
  const map = new Map<string, Field>()
  for (const f of fields) {
    map.set(fieldKey(f), f)
  }
  return map
}

/**
 * Recursively merge children of two object fields.
 * Fields unique to A or B are included; conflicts use A's version.
 */
function mergeChildren(aChildren: Field[] | undefined, bChildren: Field[] | undefined): Field[] | undefined {
  if (!aChildren && !bChildren) return undefined
  if (!aChildren) return bChildren!.map(cloneField)
  if (!bChildren) return aChildren.map(cloneField)

  const bMap = buildFieldMap(bChildren)
  const merged: Field[] = []
  const seen = new Set<string>()

  // Add all from A (with merged children if B also has the key)
  for (const af of aChildren) {
    const key = fieldKey(af)
    seen.add(key)
    const bf = bMap.get(key)
    if (bf && af.children && bf.children) {
      merged.push({ ...cloneField(af), children: mergeChildren(af.children, bf.children) })
    } else {
      merged.push(cloneField(af))
    }
  }

  // Add fields only in B
  for (const bf of bChildren) {
    const key = fieldKey(bf)
    if (!seen.has(key)) {
      merged.push(cloneField(bf))
    }
  }

  return merged
}

/** A ∪ B — all unique fields from both, merged children for objects */
export function unionFields(a: Field[], b: Field[]): Field[] {
  const bMap = buildFieldMap(b)
  const result: Field[] = []
  const seen = new Set<string>()

  for (const af of a) {
    const key = fieldKey(af)
    seen.add(key)
    const bf = bMap.get(key)
    if (bf && af.type === 'object' && bf.type === 'object') {
      result.push({ ...cloneField(af), children: mergeChildren(af.children, bf.children) })
    } else {
      result.push(cloneField(af))
    }
  }

  for (const bf of b) {
    const key = fieldKey(bf)
    if (!seen.has(key)) {
      result.push(cloneField(bf))
    }
  }

  return result
}

/** A ∩ B — fields present in both A and B (by path) */
export function intersectionFields(a: Field[], b: Field[]): Field[] {
  const bMap = buildFieldMap(b)
  const result: Field[] = []

  for (const af of a) {
    const key = fieldKey(af)
    if (bMap.has(key)) {
      result.push(cloneField(af))
    }
  }

  return result
}

/** A − B — fields in A not in B */
export function differenceFields(a: Field[], b: Field[]): Field[] {
  const bMap = buildFieldMap(b)
  const result: Field[] = []

  for (const af of a) {
    const key = fieldKey(af)
    if (!bMap.has(key)) {
      result.push(cloneField(af))
    }
  }

  return result
}

/** B − A — fields in B not in A (complement) */
export function complementFields(a: Field[], b: Field[]): Field[] {
  return differenceFields(b, a)
}

/** Execute a set operation on two field arrays */
export function applySetOperation(a: Field[], b: Field[], operation: SetOperation): Field[] {
  switch (operation) {
    case 'union': return unionFields(a, b)
    case 'intersection': return intersectionFields(a, b)
    case 'difference': return differenceFields(a, b)
    case 'complement': return complementFields(a, b)
  }
}
