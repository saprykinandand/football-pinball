import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { writeTranslatedPoints } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function updateGoalkeeper(scene, delta) {
  if (!scene.goalkeeperState) {
    return
  }

  const bounds = scene.goalkeeperState.pathBounds
  if (!bounds) {
    return
  }

  const body = scene.goalkeeperState.body
  const halfWidth = scene.goalkeeperState.halfWidth
  const minX = bounds.minX + halfWidth
  const maxX = bounds.maxX - halfWidth
  const seconds = delta / 1000
  let nextX = body.position.x + scene.goalkeeperState.direction * params.goalkeeperSpeed * seconds

  if (nextX > maxX) {
    nextX = maxX
    scene.goalkeeperState.direction = -1
  } else if (nextX < minX) {
    nextX = minX
    scene.goalkeeperState.direction = 1
  }

  MatterBody.setPosition(body, { x: nextX, y: scene.goalkeeperState.baseCenter.y })
  const dx = nextX - scene.goalkeeperState.baseCenter.x
  writeTranslatedPoints(scene.goalkeeperState.renderPoints, scene.goalkeeperState.sourcePoints, dx, 0)
  for (const safety of scene.goalkeeperState.safetyBodies) {
    MatterBody.setPosition(safety.body, {
      x: safety.basePosition.x + dx,
      y: safety.basePosition.y,
    })
  }
}
