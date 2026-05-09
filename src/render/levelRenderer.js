import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { cleanPoints, polygonCenter } from '../level/geometry.js'
import { drawBallLayer, drawLaunchArrow } from './ballRenderer.js'
import { DRAW_ORDER, PLAY_DYNAMIC_DRAW_ORDER, PLAY_STATIC_DRAW_ORDER, colorToNumber } from './renderUtils.js'

export function drawLevel(scene) {
  refreshStaticRender(scene)
  scene.dynamicGraphics.clear()
  scene.renderStats.dynamicObjects = 0

  drawWithGraphics(scene, scene.dynamicGraphics, () => {
    if (params.showVisualShapes) {
      for (const kind of dynamicDrawOrder(scene)) {
        for (const object of scene.objectsOfKind(kind)) {
          drawObject(scene, object)
          scene.renderStats.dynamicObjects += 1
        }
      }
    }

    if (params.showAlignmentCompare && scene.mode === 'play') {
      drawAlignmentComparison(scene)
    }
  })

  drawBallLayer(scene)
  drawLaunchArrow(scene)
}

function refreshStaticRender(scene) {
  if (!scene.staticRenderDirty) {
    return
  }

  scene.staticGraphics.clear()
  drawWithGraphics(scene, scene.staticGraphics, () => {
    scene.layoutGraphics.fillStyle(0x103e23, 1)
    scene.layoutGraphics.fillRect(0, 0, scene.level.width, scene.level.height)

    if (params.showVisualShapes) {
      for (const kind of staticDrawOrder(scene)) {
        for (const object of scene.objectsOfKind(kind)) {
          drawObject(scene, object)
        }
      }
    } else {
      const spawn = scene.findObject('ball_spawn')
      if (spawn) {
        drawObject(scene, spawn)
      }
    }
  })
  scene.staticRenderDirty = false
  scene.renderStats.staticRedraws += 1
}

function drawWithGraphics(scene, graphics, callback) {
  const previousGraphics = scene.layoutGraphics
  scene.layoutGraphics = graphics
  try {
    callback()
  } finally {
    scene.layoutGraphics = previousGraphics
  }
}

function staticDrawOrder(scene) {
  return scene.mode === 'play' ? PLAY_STATIC_DRAW_ORDER : DRAW_ORDER
}

function dynamicDrawOrder(scene) {
  return scene.mode === 'play' ? PLAY_DYNAMIC_DRAW_ORDER : []
}

function drawAlignmentComparison(scene) {
  for (const object of scene.level.objects) {
    if (!object.points || object.kind === 'goalkeeper_path') {
      continue
    }

    scene.layoutGraphics.lineStyle(1, 0xffffff, 0.95)
    strokeOutline(getRuntimeSourcePoints(scene, object), scene.layoutGraphics)

    const body = scene.objectBodies.get(object.name)
    if (!body) {
      continue
    }

    scene.layoutGraphics.lineStyle(2, 0xff9d00, 0.95)
    if (Array.isArray(body)) {
      for (const part of body) {
        strokeOutline(part.vertices, scene.layoutGraphics)
      }
    } else {
      const parts = body.parts?.length > 1 ? body.parts.slice(1) : [body]
      for (const part of parts) {
        strokeOutline(part.vertices, scene.layoutGraphics)
      }
    }
  }
}

function drawObject(scene, object) {
  if (object.point) {
    if (object.kind === 'ball_spawn') {
      const radius = Math.max(object.radius || 6, 6)
      scene.layoutGraphics.lineStyle(2, 0xffffff, 0.95)
      scene.layoutGraphics.strokeCircle(object.point.x, object.point.y, radius + 4)
      scene.layoutGraphics.lineStyle(2, 0x72e8ff, 0.95)
      scene.layoutGraphics.beginPath()
      scene.layoutGraphics.moveTo(object.point.x - radius - 3, object.point.y)
      scene.layoutGraphics.lineTo(object.point.x + radius + 3, object.point.y)
      scene.layoutGraphics.moveTo(object.point.x, object.point.y - radius - 3)
      scene.layoutGraphics.lineTo(object.point.x, object.point.y + radius + 3)
      scene.layoutGraphics.strokePath()
      scene.layoutGraphics.fillStyle(0x72e8ff, 0.65)
      scene.layoutGraphics.fillCircle(object.point.x, object.point.y, 3)
      return
    }
    const radius = object.kind === 'anchor' ? 5 : Math.max(object.radius || 4, 4)
    scene.layoutGraphics.fillStyle(colorToNumber(object.fill), object.alpha ?? 1)
    scene.layoutGraphics.fillCircle(object.point.x, object.point.y, radius)
    scene.layoutGraphics.lineStyle(1, 0xffffff, 0.9)
    scene.layoutGraphics.strokeCircle(object.point.x, object.point.y, radius + 2)
    return
  }

  const points = object.kind === 'bumper' ? getBumperRenderPoints(scene, object) : getRenderPoints(scene, object)
  if (!points?.length) {
    return
  }

  const alpha = object.alpha ?? 1
  if (object.kind === 'goalkeeper_path') {
    if (!params.showGoalkeeperPath) {
      return
    }
    scene.layoutGraphics.lineStyle(3, colorToNumber(object.fill), 0.8)
    strokePolygon(scene, points)
    return
  }

  scene.layoutGraphics.fillStyle(colorToNumber(object.fill), alpha)
  scene.layoutGraphics.lineStyle(2, strokeColorFor(object), 0.85)
  fillPolygon(scene, points)
  scene.layoutGraphics.strokePath()
}

function getRenderPoints(scene, object) {
  if (scene.mode === 'play' && (object.kind === 'flipper' || object.kind === 'goalkeeper')) {
    const runtimePoints = getRuntimeSourcePoints(scene, object)
    if (object.kind === 'goalkeeper') {
      return applyCharacterHitOffset(scene, object, runtimePoints)
    }
    return runtimePoints
  }
  if (scene.mode === 'play' && object.kind === 'player') {
    return applyCharacterHitOffset(scene, object, getRuntimeSourcePoints(scene, object))
  }
  return object.points
}

function getBumperRenderPoints(scene, object) {
  const points = getRenderPoints(scene, object)
  if (!points?.length || scene.mode !== 'play') {
    return points
  }
  const hit = scene.bumperHitEffects.get(object.name)
  if (!hit) {
    return points
  }
  const remaining = hit.endsAt - scene.time.now
  if (remaining <= 0) {
    scene.bumperHitEffects.delete(object.name)
    return points
  }
  const t = remaining / hit.durationMs
  const squash = hit.scale * t
  const center = polygonCenter(points)
  const factor = Math.max(0.75, 1 - squash)
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor,
  }))
}

export function markBumperHit(scene, levelName) {
  if (!levelName) {
    return
  }
  const durationMs = Math.max(16, params.bumperHitDurationMs)
  scene.bumperHitEffects.set(levelName, {
    endsAt: scene.time.now + durationMs,
    durationMs,
    scale: Phaser.Math.Clamp(params.bumperHitScale, 0, 0.4),
  })
}

function applyCharacterHitOffset(scene, object, points) {
  if (!points?.length) {
    return points
  }
  const hit = scene.characterHitEffects.get(object.name)
  if (!hit) {
    return points
  }
  const remaining = hit.endsAt - scene.time.now
  if (remaining <= 0) {
    scene.characterHitEffects.delete(object.name)
    return points
  }
  const progress = Phaser.Math.Clamp(1 - remaining / hit.durationMs, 0, 1)
  const pulse = progress < 0.5 ? progress * 2 : (1 - progress) * 2
  const offset = hit.offsetPx * pulse
  return points.map((point) => ({
    x: point.x + hit.dirX * offset,
    y: point.y + hit.dirY * offset,
  }))
}

export function markCharacterHit(scene, levelName, kind) {
  if (!levelName || !scene.ballBody) {
    return
  }
  const velocity = scene.ballBody.velocity
  const length = Math.max(Math.hypot(velocity.x, velocity.y), 0.0001)
  const dirX = velocity.x / length
  const dirY = velocity.y / length
  const durationMs = Math.max(20, kind === 'goalkeeper' ? params.goalkeeperHitDurationMs : params.playerHitDurationMs)
  const offsetPx = Math.max(0, kind === 'goalkeeper' ? params.goalkeeperHitOffsetPx : params.playerHitOffsetPx)
  scene.characterHitEffects.set(levelName, {
    endsAt: scene.time.now + durationMs,
    durationMs,
    dirX,
    dirY,
    offsetPx,
  })
}

function getRuntimeSourcePoints(scene, object) {
  if (object.kind === 'flipper') {
    const state = scene.flipperState.get(object.name)
    if (!state) {
      return object.points
    }
    return state.renderPoints || object.points
  }

  if (object.kind === 'goalkeeper') {
    if (!scene.goalkeeperState) {
      return object.points
    }
    return scene.goalkeeperState.renderPoints || object.points
  }

  if (object.kind === 'player') {
    const state = scene.playerMovementState.get(object.name)
    if (!state) {
      return object.points
    }
    return state.renderPoints || object.points
  }

  return object.points
}

function strokeColorFor(object) {
  if (object.kind === 'flipper') {
    return 0x6f4e00
  }
  if (object.kind === 'bumper') {
    return 0xffc1c1
  }
  if (object.kind === 'sensor_goal' || object.kind === 'sensor_lose') {
    return 0xcaffda
  }
  return 0xffffff
}

function fillPolygon(scene, points) {
  const clean = cleanPoints(points)
  scene.layoutGraphics.beginPath()
  scene.layoutGraphics.moveTo(clean[0].x, clean[0].y)
  for (let index = 1; index < clean.length; index += 1) {
    scene.layoutGraphics.lineTo(clean[index].x, clean[index].y)
  }
  scene.layoutGraphics.closePath()
  scene.layoutGraphics.fillPath()
}

function strokePolygon(scene, points) {
  const clean = cleanPoints(points)
  scene.layoutGraphics.beginPath()
  scene.layoutGraphics.moveTo(clean[0].x, clean[0].y)
  for (let index = 1; index < clean.length; index += 1) {
    scene.layoutGraphics.lineTo(clean[index].x, clean[index].y)
  }
  scene.layoutGraphics.closePath()
  scene.layoutGraphics.strokePath()
}

function strokeOutline(points, graphics) {
  const clean = cleanPoints(points)
  if (!clean.length) {
    return
  }

  graphics.beginPath()
  graphics.moveTo(clean[0].x, clean[0].y)
  for (let index = 1; index < clean.length; index += 1) {
    graphics.lineTo(clean[index].x, clean[index].y)
  }
  graphics.closePath()
  graphics.strokePath()
}
