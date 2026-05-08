import { DEFAULT_LEVEL } from '../defaultLevel.js'

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
  for (const object of level.objects) {
    if (!object.pair || object.mirrorAxis !== undefined) {
      continue
    }

    const paired = level.objects.find((item) => item.name === object.pair)
    if (!paired) {
      continue
    }

    const axis = (objectCenterX(object) + objectCenterX(paired)) / 2
    object.mirrorAxis = axis
    paired.mirrorAxis = axis
  }
}

function objectCenterX(object) {
  if (object.point) {
    return object.point.x
  }
  return polygonCenter(object.points).x
}

function polygonCenter(points) {
  const clean = cleanPoints(points)
  const total = clean.reduce((sum, point) => {
    sum.x += point.x
    sum.y += point.y
    return sum
  }, { x: 0, y: 0 })
  return { x: total.x / clean.length, y: total.y / clean.length }
}

function cleanPoints(points) {
  const next = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
  if (next.length > 2) {
    const first = next[0]
    const last = next[next.length - 1]
    if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
      next.pop()
    }
  }
  return next
}
