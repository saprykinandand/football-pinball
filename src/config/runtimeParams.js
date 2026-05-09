import { createDefaultParams } from './physicsTuning.js'
import { applyPhysicsConfig, readStoredPhysicsConfig } from './physicsStore.js'

export const params = createDefaultParams()

const storedPhysicsConfig = readStoredPhysicsConfig()
applyPhysicsConfig(params, storedPhysicsConfig)
migrateBallTrailDefaults(params, storedPhysicsConfig)

if (storedPhysicsConfig && !Object.prototype.hasOwnProperty.call(storedPhysicsConfig, 'debugMatterEnabled')) {
  params.showMatterBodies = false
  params.showSafetyBodies = false
  params.showAlignmentCompare = false
}

function migrateBallTrailDefaults(target, source) {
  if (!source || typeof source !== 'object') {
    return
  }

  if (source.ballTrailSpeedThreshold === 13.75 || source.ballTrailSpeedThreshold === 8.5) {
    target.ballTrailSpeedThreshold = 10
  }
  if (source.ballTrailMaxLength === 72 || source.ballTrailMaxLength === 88 || source.ballTrailMaxLength === 64) {
    target.ballTrailMaxLength = 50
  }
  if (source.ballTrailWidthScale === 1.45 || source.ballTrailWidthScale === 1.6 || source.ballTrailWidthScale === 1.05) {
    target.ballTrailWidthScale = 1
  }
  if (source.ballTrailAlpha === 0.75 || source.ballTrailAlpha === 0.9 || source.ballTrailAlpha === 0.85) {
    target.ballTrailAlpha = 0.4
  }
}
