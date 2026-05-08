import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { pointsBounds, translatePoints } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function updateGoalkeeper(scene, delta) {
  if (!scene.goalkeeperState) {
    return
  }

  const path = scene.findObject('path_of_goal_keeper')
  if (!path?.points) {
    return
  }

  const bounds = pointsBounds(path.points)
  const body = scene.goalkeeperState.body
  const goalieBounds = pointsBounds(body.vertices)
  const halfWidth = (goalieBounds.maxX - goalieBounds.minX) / 2
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
  scene.goalkeeperState.renderPoints = translatePoints(scene.goalkeeperState.sourcePoints, dx, 0)
  for (const safety of scene.goalkeeperState.safetyBodies) {
    MatterBody.setPosition(safety.body, {
      x: safety.basePosition.x + dx,
      y: safety.basePosition.y,
    })
  }
}
