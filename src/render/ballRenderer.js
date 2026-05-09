import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'

const BALL_TRAIL_TEXTURE_KEY = 'ball-speed-trail-gradient'
const BALL_TRAIL_TEXTURE_WIDTH = 128
const BALL_TRAIL_TEXTURE_HEIGHT = 16
const OUTER_SEGMENTS = 34
const INNER_SEGMENTS = 28

export function drawBallLayer(scene) {
  scene.ballGraphics.clear()
  if (scene.ballBody) {
    drawBallTrail(scene)
    drawBall(scene)
  } else {
    hideBallTrail(scene)
    scene.renderStats.ballPointsReused = 0
  }
}

export function drawLaunchArrow(scene) {
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
  scene.ballGraphics.lineStyle(3, 0x72e8ff, 0.95)
  scene.ballGraphics.beginPath()
  scene.ballGraphics.moveTo(start.x, start.y)
  scene.ballGraphics.lineTo(end.x, end.y)
  scene.ballGraphics.strokePath()
  scene.ballGraphics.beginPath()
  scene.ballGraphics.moveTo(end.x, end.y)
  scene.ballGraphics.lineTo(
    end.x - Math.cos(angle - Math.PI / 6) * headLength,
    end.y - Math.sin(angle - Math.PI / 6) * headLength,
  )
  scene.ballGraphics.moveTo(end.x, end.y)
  scene.ballGraphics.lineTo(
    end.x - Math.cos(angle + Math.PI / 6) * headLength,
    end.y - Math.sin(angle + Math.PI / 6) * headLength,
  )
  scene.ballGraphics.strokePath()
}

function drawBallTrail(scene) {
  const velocity = scene.ballBody.velocity
  const speed = Math.hypot(velocity.x, velocity.y)
  const maxSpeed = Math.max(params.maxBallSpeed, 1)
  const threshold = Phaser.Math.Clamp(params.ballTrailSpeedThreshold ?? maxSpeed * 0.55, 0, maxSpeed)
  if (speed <= threshold) {
    hideBallTrail(scene)
    return
  }

  const fadeAmount = Phaser.Math.Clamp((speed - threshold) / Math.max(threshold * 0.5, 1), 0, 1)
  const ballRadius = scene.getBallRadius()
  const angle = ballSquashAngle(scene)
  const squash = ballSquashAmount(scene)
  const squeeze = Math.max(0.55, 1 - squash * 0.65)
  const trailLength = Math.max(0, params.ballTrailMaxLength) * (0.82 + fadeAmount * 0.18)
  const maxWidth = ballRadius * 2 * squeeze * Math.max(0, params.ballTrailWidthScale)
  const maxAlpha = Phaser.Math.Clamp(params.ballTrailAlpha, 0, 1) * fadeAmount
  const trail = ensureBallTrailImage(scene)

  trail
    .setPosition(scene.ballBody.position.x, scene.ballBody.position.y)
    .setRotation(angle)
    .setAlpha(maxAlpha)
    .setDisplaySize(Math.max(1, trailLength), Math.max(1, maxWidth))
    .setVisible(true)
}

function ensureBallTrailImage(scene) {
  if (!scene.textures.exists(BALL_TRAIL_TEXTURE_KEY)) {
    const texture = scene.textures.createCanvas(BALL_TRAIL_TEXTURE_KEY, BALL_TRAIL_TEXTURE_WIDTH, BALL_TRAIL_TEXTURE_HEIGHT)
    const context = texture.context
    const gradient = context.createLinearGradient(0, 0, BALL_TRAIL_TEXTURE_WIDTH, 0)
    gradient.addColorStop(0, 'rgba(115, 115, 115, 0)')
    gradient.addColorStop(1, 'rgba(84, 248, 149, 1)')
    context.fillStyle = gradient
    context.fillRect(0, 0, BALL_TRAIL_TEXTURE_WIDTH, BALL_TRAIL_TEXTURE_HEIGHT)
    texture.refresh()
  }

  if (!scene.ballTrailImage) {
    scene.ballTrailImage = scene.add.image(0, 0, BALL_TRAIL_TEXTURE_KEY)
      .setOrigin(1, 0.5)
      .setDepth(1)
      .setVisible(false)
  }

  return scene.ballTrailImage
}

function hideBallTrail(scene) {
  scene.ballTrailImage?.setVisible(false)
}

function drawBall(scene) {
  const cache = getBallRenderCache(scene)
  const ballRadius = scene.getBallRadius()
  const squash = ballSquashAmount(scene)
  const squashAngle = ballSquashAngle(scene)
  const angle = scene.ballVisualAngle
  const ovalRadiusX = ballRadius * 0.55
  const ovalRadiusY = ballRadius * 0.85
  const cosAngle = Math.cos(angle)
  const sinAngle = Math.sin(angle)

  for (let i = 0; i < OUTER_SEGMENTS; i += 1) {
    const t = (i / OUTER_SEGMENTS) * Math.PI * 2
    writeBallVisualPoint(
      scene,
      cache.outerPoints[i],
      Math.cos(t) * ballRadius,
      Math.sin(t) * ballRadius,
      squashAngle,
      squash,
    )
  }

  scene.ballGraphics.fillStyle(0xffffff, 1)
  scene.ballGraphics.fillPoints(cache.outerPoints, true)

  for (let i = 0; i < INNER_SEGMENTS; i += 1) {
    const t = (i / INNER_SEGMENTS) * Math.PI * 2
    const localX = Math.cos(t) * ovalRadiusX
    const localY = Math.sin(t) * ovalRadiusY
    const spunX = localX * cosAngle - localY * sinAngle
    const spunY = localX * sinAngle + localY * cosAngle
    writeBallVisualPoint(scene, cache.innerPoints[i], spunX, spunY, squashAngle, squash)
  }

  scene.ballGraphics.fillStyle(0x3a2416, 1)
  scene.ballGraphics.fillPoints(cache.innerPoints, true)
  scene.renderStats.ballPointsReused = OUTER_SEGMENTS + INNER_SEGMENTS
}

function getBallRenderCache(scene) {
  if (!scene.ballRenderCache) {
    scene.ballRenderCache = {
      outerPoints: createPointArray(OUTER_SEGMENTS),
      innerPoints: createPointArray(INNER_SEGMENTS),
    }
  }
  return scene.ballRenderCache
}

function createPointArray(length) {
  return Array.from({ length }, () => ({ x: 0, y: 0 }))
}

function writeBallVisualPoint(scene, target, localX, localY, angle, squash) {
  const stretch = 1 + squash
  const squeeze = Math.max(0.55, 1 - squash * 0.65)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const worldX = localX * stretch
  const worldY = localY * squeeze
  target.x = scene.ballBody.position.x + worldX * cos - worldY * sin
  target.y = scene.ballBody.position.y + worldX * sin + worldY * cos
  return target
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
