import { DEFAULT_PHYSICS_CONFIG, createDefaultParams } from './physicsTuning.js'

export const PHYSICS_STORAGE_KEY = 'football-pinball.physics-config.v2'

const PHYSICS_PARAM_TYPES = Object.fromEntries(
  Object.entries(DEFAULT_PHYSICS_CONFIG).map(([key, value]) => [key, typeof value]),
)

export function applyPhysicsConfig(target, source) {
  if (!source || typeof source !== 'object') {
    return false
  }
  let changed = false
  for (const [key, expectedType] of Object.entries(PHYSICS_PARAM_TYPES)) {
    const value = source[key]
    if (typeof value === expectedType) {
      target[key] = value
      changed = true
    }
  }
  return changed
}

export function readStoredPhysicsConfig() {
  const raw = localStorage.getItem(PHYSICS_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function exportPhysicsConfigJson(sourceParams) {
  const clean = {}
  for (const key of Object.keys(DEFAULT_PHYSICS_CONFIG)) {
    clean[key] = sourceParams[key]
  }
  return JSON.stringify(clean, null, 2)
}

export function savePhysicsConfigToStorage(sourceParams) {
  localStorage.setItem(PHYSICS_STORAGE_KEY, exportPhysicsConfigJson(sourceParams))
}

export function resetPhysicsParamsToDefaults(target) {
  const defaults = createDefaultParams()
  for (const key of Object.keys(DEFAULT_PHYSICS_CONFIG)) {
    target[key] = defaults[key]
  }
}
