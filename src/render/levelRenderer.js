import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { cleanPoints, polygonCenter } from '../level/geometry.js'
import { DRAW_ORDER, PLAY_DYNAMIC_DRAW_ORDER, PLAY_STATIC_DRAW_ORDER, colorToNumber } from './renderUtils.js'

export function drawLevel(scene) {
  refreshStaticRender(scene)
  scene.layoutGraphics.clear()
  scene.editGraphics.clear()

  if (params.showVisualShapes) {
    for (const kind of dynamicDrawOrder(scene)) {
      for (const object of scene.objectsOfKind(kind)) {
        drawObject(scene, object)
      }
    }
  }

  if (params.showAlignmentCompare && scene.mode === 'play') {
    drawAlignmentComparison(scene)
  }

  if (scene.ballBody) {
    drawBall(scene)
  }

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

function drawBall(scene) {
  const ballRadius = scene.getBallRadius()
  const squash = ballSquashAmount(scene)
  const squashAngle = ballSquashAngle(scene)
  const angle = scene.ballVisualAngle
  const ovalRadiusX = ballRadius * 0.55
  const ovalRadiusY = ballRadius * 0.85
  const cosAngle = Math.cos(angle)
  const sinAngle = Math.sin(angle)

  const outerPoints = []
  const outerSegments = 34
  for (let i = 0; i < outerSegments; i += 1) {
    const t = (i / outerSegments) * Math.PI * 2
    outerPoints.push(ballVisualPoint(scene, Math.cos(t) * ballRadius, Math.sin(t) * ballRadius, squashAngle, squash))
  }

  scene.layoutGraphics.fillStyle(0xffffff, 1)
  scene.layoutGraphics.fillPoints(outerPoints, true)

  const points = []
  const segments = 28
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2
    const localX = Math.cos(t) * ovalRadiusX
    const localY = Math.sin(t) * ovalRadiusY
    const spunX = localX * cosAngle - localY * sinAngle
    const spunY = localX * sinAngle + localY * cosAngle
    points.push(ballVisualPoint(scene, spunX, spunY, squashAngle, squash))
  }

  scene.layoutGraphics.fillStyle(0x3a2416, 1)
  scene.layoutGraphics.fillPoints(points, true)
}

function ballVisualPoint(scene, localX, localY, angle, squash) {
  const stretch = 1 + squash
  const squeeze = Math.max(0.55, 1 - squash * 0.65)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const worldX = localX * stretch
  const worldY = localY * squeeze
  return {
    x: scene.ballBody.position.x + worldX * cos - worldY * sin,
    y: scene.ballBody.position.y + worldX * sin + worldY * cos,
  }
}

function ballSquashAmount(scene) {
  if (!scene.ballBody) {
    return 0
  }

  const speed = Math.hypot(scene.ballBody.velocity.x, scene.ballBody.velocity.y)
  const speedAmount = Phaser.Math.Clamp(speed / Math.max(params.maxBallSpeed, 1), 0, 1) * Math.max(0, params.ballSpeedSquash)
  return Phaser.Math.Clamp(speedAmount + scene.ballImpactSquash, 0, 0.45)
}

function ballSquashAngle(scene) {
  if (!scene.ballBody) {
    return scene.ballImpactAngle
  }

  const velocity = scene.ballBody.velocity
  if (Math.hypot(velocity.x, velocity.y) > 0.08) {
    return Math.atan2(velocity.y, velocity.x)
  }
  return scene.ballImpactAngle
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

function drawLaunchArrow(scene) {
  if (!params.showLaunchArrow) {
    scene.launchArrow = null
    return
  }

  if (!scene.launchArrow) {
    return
  }

  if (scene.time.now > scene.launchArrow.expiresAt) {
    scene.launchArrow = null
    return
  }

  const { start, end } = scene.launchArrow
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const headLength = 12
  scene.layoutGraphics.lineStyle(3, 0x72e8ff, 0.95)
  scene.layoutGraphics.beginPath()
  scene.layoutGraphics.moveTo(start.x, start.y)
  scene.layoutGraphics.lineTo(end.x, end.y)
  scene.layoutGraphics.strokePath()
  scene.layoutGraphics.beginPath()
  scene.layoutGraphics.moveTo(end.x, end.y)
  scene.layoutGraphics.lineTo(
    end.x - Math.cos(angle - Math.PI / 6) * headLength,
    end.y - Math.sin(angle - Math.PI / 6) * headLength,
  )
  scene.layoutGraphics.moveTo(end.x, end.y)
  scene.layoutGraphics.lineTo(
    end.x - Math.cos(angle + Math.PI / 6) * headLength,
    end.y - Math.sin(angle + Math.PI / 6) * headLength,
  )
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
