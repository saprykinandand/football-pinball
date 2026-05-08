import { DEFAULT_LEVEL } from '../defaultLevel.js'
import { mirrorPoints } from './geometry.js'

export const STORAGE_KEY = 'football-pinball-layout-json'

export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function readStoredLevel() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseLevelJson(stored) : clone(DEFAULT_LEVEL)
  } catch {
    return clone(DEFAULT_LEVEL)
  }
}

export function saveStoredLevelJson(json) {
  localStorage.setItem(STORAGE_KEY, json)
}

export function clearStoredLevel() {
  localStorage.removeItem(STORAGE_KEY)
}

export function parseLevelJson(json) {
  return normalizeLevel(JSON.parse(json))
}

export function serializeLevel(level) {
  return JSON.stringify(level, null, 2)
}

export function normalizeLevel(level) {
  const next = clone(level)
  next.width = Number(next.width || DEFAULT_LEVEL.width)
  next.height = Number(next.height || DEFAULT_LEVEL.height)
  next.ball = next.ball || clone(DEFAULT_LEVEL.ball)
  next.objects = Array.isArray(next.objects) ? next.objects : clone(DEFAULT_LEVEL.objects)
  ensureBallSpawn(next)
  ensureMirrorAxes(next)
  ensureMirroredFieldCollision(next)
  return next
}

export function defaultBallSpawn(level) {
  return {
    x: level.width / 2,
    y: level.height * 0.68,
  }
}

export function ensureBallSpawn(level) {
  const existing = level.objects.find((object) => object.name === 'ball_spawn' || object.kind === 'ball_spawn')
  const spawn = existing?.point || level.ball?.spawn || defaultBallSpawn(level)

  level.ball = level.ball || {}
  level.ball.spawn = { x: Number(spawn.x), y: Number(spawn.y) }

  if (existing) {
    existing.name = 'ball_spawn'
    existing.kind = 'ball_spawn'
    existing.point = { ...level.ball.spawn }
    existing.radius = existing.radius || 6
    existing.fill = existing.fill || '#FFFFFF'
    return
  }

  level.objects.unshift({
    name: 'ball_spawn',
    kind: 'ball_spawn',
    fill: '#FFFFFF',
    point: { ...level.ball.spawn },
    radius: 6,
  })
}

function ensureMirrorAxes(level) {
  const axis = level.width / 2
  for (const object of level.objects) {
    if (!object.pair) {
      continue
    }

    const paired = level.objects.find((item) => item.name === object.pair)
    if (!paired) {
      continue
    }

    object.mirrorAxis = axis
    paired.mirrorAxis = axis
  }
}

function ensureMirroredFieldCollision(level) {
  const left = level.objects.find((object) => object.name === 'field_collision_left_instance' && object.points)
  const right = level.objects.find((object) => object.name === 'field_collision_right_instance' && object.points)
  if (!left || !right) {
    return
  }

  const axis = level.width / 2
  right.points = mirrorPoints(left.points, axis)
  left.pair = right.name
  right.pair = left.name
  left.mirrorAxis = axis
  right.mirrorAxis = axis
}
