import { createDefaultParams } from './physicsTuning.js'
import { applyPhysicsConfig, readStoredPhysicsConfig } from './physicsStore.js'

export const params = createDefaultParams()

const storedPhysicsConfig = readStoredPhysicsConfig()
applyPhysicsConfig(params, storedPhysicsConfig)

if (storedPhysicsConfig && !Object.prototype.hasOwnProperty.call(storedPhysicsConfig, 'debugMatterEnabled')) {
  params.showMatterBodies = false
  params.showSafetyBodies = false
  params.showAlignmentCompare = false
}
