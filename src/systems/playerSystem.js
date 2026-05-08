import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { translatePoints } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body

export function updatePlayers(scene) {
  for (const state of scene.playerMovementState.values()) {
    const movement = playerMovementOffset(scene, state)
    const nextPosition = {
      x: state.baseCenter.x + movement.x,
      y: state.baseCenter.y + movement.y,
    }

    state.renderPoints = translatePoints(state.sourcePoints, movement.x, movement.y)
    MatterBody.setPosition(state.body, nextPosition)
    for (const safety of state.safetyBodies) {
      MatterBody.setPosition(safety.body, {
        x: safety.basePosition.x + movement.x,
        y: safety.basePosition.y + movement.y,
      })
    }
  }
}

export function playerMovementOffset(scene, state) {
  if (!params.playerMovementEnabled) {
    return { x: 0, y: 0 }
  }

  const distance = Math.max(0, params.playerMovementDistance)
  const phase = Math.sin(scene.time.now * 0.001 * Math.max(0, params.playerMovementSpeed))
  const direction = params.playerMovementParallel ? 1 : state.direction
  const x = phase * distance * direction
  const y = playerMovementArcY(phase)
  return { x, y }
}

export function playerMovementArcY(phase) {
  const height = params.playerMovementArcHeight
  if (height === 0) {
    return 0
  }

  return -height * (1 - phase * phase)
}
