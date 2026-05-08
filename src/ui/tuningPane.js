import { Pane } from 'tweakpane'
import { DEFAULT_PHYSICS_CONFIG } from '../config/physicsTuning.js'
import { exportPhysicsConfigJson, savePhysicsConfigToStorage } from '../config/physicsStore.js'
import { formatTime } from '../utils/time.js'

export function setupTuningPane(params, getScene) {
  const pane = new Pane({ title: 'Physics Debug' })
  pane.element.classList.add('debug-pane')
  pane.element.classList.add('is-hidden')
  let physicsSyncTimer = null

  const scene = () => getScene?.()

  const syncPhysicsSoon = () => {
    window.clearTimeout(physicsSyncTimer)
    physicsSyncTimer = window.setTimeout(() => {
      savePhysicsConfigToStorage(params)
      const currentScene = scene()
      if (currentScene) {
        currentScene.syncPhysicsTextarea()
        currentScene.setJsonState('physics', `autosaved ${formatTime()}`)
      }
    }, 250)
  }
  
  const worldFolder = pane.addFolder({ title: 'World' })
  worldFolder.addBinding(params, 'gravityY', { min: 0.2, max: 2.2, step: 0.01, label: 'Gravity Y' })
  worldFolder.addBinding(params, 'maxBallSpeed', { min: 4, max: 40, step: 0.5, label: 'Max Ball Speed' })
  worldFolder.addBinding(params, 'goalkeeperSpeed', { min: 20, max: 180, step: 1, label: 'Keeper Speed' })
  worldFolder.addBinding(params, 'maxVisualDeltaMs', { min: 16, max: 80, step: 1, label: 'Max Visual Delta' })
  
  const ballFolder = pane.addFolder({ title: 'Ball' })
  const ballRadiusBinding = ballFolder.addBinding(params, 'ballRadius', { min: 4, max: 32, step: 0.5, label: 'Radius' })
  ballFolder.addBinding(params, 'ballDensity', { min: 0.0001, max: 0.03, step: 0.0001, label: 'Density' })
  ballFolder.addBinding(params, 'ballFriction', { min: 0, max: 0.15, step: 0.001, label: 'Friction' })
  ballFolder.addBinding(params, 'ballFrictionAir', { min: 0, max: 0.08, step: 0.0005, label: 'Air Friction' })
  ballFolder.addBinding(params, 'ballRestitution', { min: 0.1, max: 1.3, step: 0.01, label: 'Restitution' })
  ballFolder.addBinding(params, 'ballSpeedSquash', { min: 0, max: 0.4, step: 0.01, label: 'Speed Squash' })
  ballFolder.addBinding(params, 'ballImpactSquash', { min: 0, max: 0.45, step: 0.01, label: 'Impact Squash' })
  ballFolder.addBinding(params, 'ballSquashRecover', { min: 1, max: 18, step: 0.5, label: 'Squash Recover' })
  
  const bumpersFolder = pane.addFolder({ title: 'Bumpers' })
  bumpersFolder.addBinding(params, 'bumperRestitution', { min: 0.3, max: 1.8, step: 0.01, label: 'Restitution' })
  bumpersFolder.addBinding(params, 'bumperImpulse', { min: 0, max: 0.08, step: 0.001, label: 'Impulse' })
  bumpersFolder.addBinding(params, 'bumperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' })
  bumpersFolder.addBinding(params, 'bumperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
  bumpersFolder.addBinding(params, 'bumperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
  bumpersFolder.addBinding(params, 'bumperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
  bumpersFolder.addBinding(params, 'contactAntiStallKickScale', { min: 0, max: 4, step: 0.05, label: 'Anti-Stall Kick' })
  bumpersFolder.addBinding(params, 'contactAntiStallCooldownMs', { min: 30, max: 1000, step: 10, label: 'Anti-Stall Cooldown' })
  bumpersFolder.addBinding(params, 'contactKickCooldownMs', { min: 0, max: 800, step: 10, label: 'Contact Cooldown' })
  bumpersFolder.addBinding(params, 'bumperHitScale', { min: 0, max: 0.4, step: 0.01, label: 'Hit Squash' })
  bumpersFolder.addBinding(params, 'bumperHitDurationMs', { min: 16, max: 240, step: 4, label: 'Hit Duration' })
  
  const playersFolder = pane.addFolder({ title: 'Players' })
  playersFolder.addBinding(params, 'playerImpulse', { min: 0, max: 0.08, step: 0.001, label: 'Impulse' })
  playersFolder.addBinding(params, 'playerWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
  playersFolder.addBinding(params, 'playerVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
  playersFolder.addBinding(params, 'playerLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
  playersFolder.addBinding(params, 'playerHitOffsetPx', { min: 0, max: 24, step: 1, label: 'Hit Offset Px' })
  playersFolder.addBinding(params, 'playerHitDurationMs', { min: 20, max: 260, step: 5, label: 'Hit Duration' })
  playersFolder.addBinding(params, 'playerMovementEnabled', { label: 'Move Players' })
  playersFolder.addBinding(params, 'playerMovementParallel', { label: 'Parallel Move' })
  playersFolder.addBinding(params, 'playerMovementDistance', { min: 0, max: 80, step: 1, label: 'Move Distance' })
  playersFolder.addBinding(params, 'playerMovementSpeed', { min: 0, max: 6, step: 0.1, label: 'Move Speed' })
  playersFolder.addBinding(params, 'playerMovementArcHeight', { min: -120, max: 120, step: 2, label: 'Arc Height' })
  
  const goalkeeperFolder = pane.addFolder({ title: 'Goalkeeper' })
  goalkeeperFolder.addBinding(params, 'goalkeeperImpulse', { min: 0, max: 0.1, step: 0.001, label: 'Impulse' })
  goalkeeperFolder.addBinding(params, 'goalkeeperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' })
  goalkeeperFolder.addBinding(params, 'goalkeeperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' })
  goalkeeperFolder.addBinding(params, 'goalkeeperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' })
  goalkeeperFolder.addBinding(params, 'goalkeeperGoalAvoidBias', { min: 0, max: 0.95, step: 0.01, label: 'Avoid Goal Bias' })
  goalkeeperFolder.addBinding(params, 'goalkeeperHitOffsetPx', { min: 0, max: 28, step: 1, label: 'Hit Offset Px' })
  goalkeeperFolder.addBinding(params, 'goalkeeperHitDurationMs', { min: 20, max: 280, step: 5, label: 'Hit Duration' })
  
  const flippersFolder = pane.addFolder({ title: 'Flippers' })
  flippersFolder.addBinding(params, 'flipperSpeed', { min: 0.02, max: 0.7, step: 0.01, label: 'Speed' })
  flippersFolder.addBinding(params, 'flipperKick', { min: 0, max: 0.09, step: 0.001, label: 'Kick' })
  flippersFolder.addBinding(params, 'flipperVelocityKick', { min: 0, max: 36, step: 0.5, label: 'Velocity Kick' })
  flippersFolder.addBinding(params, 'flipperKickCooldownMs', { min: 0, max: 500, step: 10, label: 'Kick Cooldown' })
  flippersFolder.addBinding(params, 'flipperKickMinAngleStep', { min: 0, max: 0.08, step: 0.002, label: 'Kick Motion Min' })
  flippersFolder.addBinding(params, 'flipperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' })
  flippersFolder.addBinding(params, 'flipperTipBoost', { min: 0, max: 2, step: 0.05, label: 'Tip Boost' })
  flippersFolder.addBinding(params, 'flipperMinTipScale', { min: 0.1, max: 1, step: 0.05, label: 'Base Tip Scale' })
  
  const collisionsFolder = pane.addFolder({ title: 'Collisions' })
  collisionsFolder.addBinding(params, 'wallRestitution', { min: 0.05, max: 1.2, step: 0.01, label: 'Wall Rest.' })
  for (const binding of [
    collisionsFolder.addBinding(params, 'wallPadding', { min: 4, max: 20, step: 1, label: 'Wall Padding' }),
    collisionsFolder.addBinding(params, 'goalPadding', { min: 2, max: 16, step: 1, label: 'Goal Padding' }),
    collisionsFolder.addBinding(params, 'playerPadding', { min: 0, max: 8, step: 1, label: 'Player Padding' }),
    collisionsFolder.addBinding(params, 'bumperPadding', { min: 0, max: 8, step: 1, label: 'Bumper Padding' }),
    collisionsFolder.addBinding(params, 'flipperPadding', { min: 0, max: 3, step: 0.5, label: 'Flipper Padding' }),
  ]) {
    binding.on('change', () => {
      const currentScene = scene()
      if (currentScene?.mode === 'play') {
        currentScene.rebuildPlayBodies()
      }
    })
  }
  
  const serveFolder = pane.addFolder({ title: 'Serve' })
  serveFolder.addBinding(params, 'launchForceMin', { min: 0, max: 0.12, step: 0.001, label: 'Force Min' })
  serveFolder.addBinding(params, 'launchForceMax', { min: 0, max: 0.12, step: 0.001, label: 'Force Max' })
  serveFolder.addBinding(params, 'launchDelayMs', { min: 0, max: 1200, step: 25, label: 'Delay' })
  serveFolder.addBinding(params, 'launchXMin', { min: -1, max: 0.5, step: 0.01, label: 'X Min' })
  serveFolder.addBinding(params, 'launchXMax', { min: -0.5, max: 1, step: 0.01, label: 'X Max' })
  serveFolder.addBinding(params, 'launchXDeadZone', { min: 0, max: 0.5, step: 0.005, label: 'X Dead' })
  
  const debugFolder = pane.addFolder({ title: 'Debug' })
  debugFolder.addBinding(params, 'debugMatterEnabled', { label: 'Matter Debug' })
  debugFolder.addBinding(params, 'showVisualShapes', { label: 'Visual SVG' })
  debugFolder.addBinding(params, 'showMatterBodies', { label: 'Matter Bodies' })
  debugFolder.addBinding(params, 'showSafetyBodies', { label: 'Safety Bodies' })
  debugFolder.addBinding(params, 'showAlignmentCompare', { label: 'Compare Align' })
  debugFolder.addBinding(params, 'showGoalkeeperPath', { label: 'Goalkeeper Path' })
  debugFolder.addBinding(params, 'showLaunchArrow', { label: 'Launch Arrow' })
  debugFolder.addBinding(params, 'showPerfStats', { label: 'Perf Stats' })
  debugFolder.addBinding(params, 'freezePhysics', { label: 'Freeze Physics' })
  
  const shakeFolder = pane.addFolder({ title: 'Camera Shake' })
  shakeFolder.addBinding(params, 'shakeFlipperDurationMs', { min: 20, max: 300, step: 5, label: 'Flipper Dur' })
  shakeFolder.addBinding(params, 'shakeFlipperIntensity', { min: 0, max: 0.01, step: 0.0001, label: 'Flipper Int' })
  shakeFolder.addBinding(params, 'shakeBumperDurationMs', { min: 20, max: 300, step: 5, label: 'Bumper Dur' })
  shakeFolder.addBinding(params, 'shakeBumperIntensity', { min: 0, max: 0.01, step: 0.0001, label: 'Bumper Int' })
  shakeFolder.addBinding(params, 'shakePlayerDurationMs', { min: 20, max: 300, step: 5, label: 'Player Dur' })
  shakeFolder.addBinding(params, 'shakePlayerIntensity', { min: 0, max: 0.01, step: 0.0001, label: 'Player Int' })
  shakeFolder.addBinding(params, 'shakeGoalDurationMs', { min: 40, max: 450, step: 5, label: 'Goal Dur' })
  shakeFolder.addBinding(params, 'shakeGoalIntensity', { min: 0, max: 0.02, step: 0.0001, label: 'Goal Int' })
  shakeFolder.addBinding(params, 'shakeImpactCooldownMs', { min: 0, max: 200, step: 5, label: 'Impact CD' })
  shakeFolder.addBinding(params, 'shakeGoalCooldownMs', { min: 0, max: 500, step: 5, label: 'Goal CD' })
  
  ballRadiusBinding.on('change', () => {
    const currentScene = scene()
    if (currentScene?.mode === 'play') {
      currentScene.rebuildBallBody()
    }
  })
  pane.on('change', () => {
    scene()?.onTuningChanged()
    syncPhysicsSoon()
  })

  return pane
}
