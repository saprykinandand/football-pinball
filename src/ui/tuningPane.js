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
  const addFolder = (parent, title, expanded = true) => parent.addFolder({ title, expanded })
  const addSecondaryFolder = (parent, title) => addFolder(parent, title, false)
  const tooltip = createHelpTooltip(pane.element)
  const addTuningBinding = (folder, key, options, helpText) => {
    const binding = folder.addBinding(params, key, options)
    if (helpText) {
      attachHelpButton(binding, tooltip, helpText)
    }
    return binding
  }

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
  
  const worldFolder = addFolder(pane, 'World')
  worldFolder.addBinding(params, 'gravityY', { min: 0.2, max: 2.2, step: 0.01, label: 'Gravity Y' })
  addTuningBinding(worldFolder, 'maxBallSpeed', { min: 4, max: 40, step: 0.5, label: 'Max Ball Speed' }, 'Жесткий лимит скорости мяча. Ниже - спокойнее и управляемее; выше - быстрее и хаотичнее.')
  const worldSecondaryFolder = addSecondaryFolder(worldFolder, 'Secondary')
  addTuningBinding(worldSecondaryFolder, 'maxVisualDeltaMs', { min: 16, max: 80, step: 1, label: 'Max Visual Delta' }, 'Ограничивает шаг времени для визуальных анимаций. Ниже - меньше рывков при просадках FPS; выше - картинка быстрее догоняет симуляцию.')
  
  const ballFolder = addFolder(pane, 'Ball')
  const ballRadiusBinding = ballFolder.addBinding(params, 'ballRadius', { min: 4, max: 32, step: 0.5, label: 'Radius' })
  addTuningBinding(ballFolder, 'ballDensity', { min: 0.0001, max: 0.03, step: 0.0001, label: 'Density' }, 'Насколько мяч тяжелый для своего размера. Выше - удары ощущаются тяжелее, мяч сложнее резко перенаправить.')
  addTuningBinding(ballFolder, 'ballFriction', { min: 0, max: 0.15, step: 0.001, label: 'Friction' }, 'Трение при контакте с поверхностями. Выше - мяч сильнее теряет скорость о стены, игроков и бамперы.')
  addTuningBinding(ballFolder, 'ballFrictionAir', { min: 0, max: 0.08, step: 0.0005, label: 'Air Friction' }, 'Постоянное сопротивление движению мяча. Выше - вся игра замедляется даже без столкновений.')
  addTuningBinding(ballFolder, 'ballRestitution', { min: 0.1, max: 1.3, step: 0.01, label: 'Restitution' }, 'Прыгучесть мяча. Выше - после столкновений сохраняется или добавляется больше скорости.')
  const ballVisualFolder = addSecondaryFolder(ballFolder, 'Visual')
  ballVisualFolder.addBinding(params, 'ballSpeedSquash', { min: 0, max: 0.4, step: 0.01, label: 'Speed Squash' })
  ballVisualFolder.addBinding(params, 'ballImpactSquash', { min: 0, max: 0.45, step: 0.01, label: 'Impact Squash' })
  ballVisualFolder.addBinding(params, 'ballSquashRecover', { min: 1, max: 18, step: 0.5, label: 'Squash Recover' })
  ballVisualFolder.addBinding(params, 'ballTrailSpeedThreshold', { min: 0, max: 40, step: 0.5, label: 'Trail Threshold' })
  ballVisualFolder.addBinding(params, 'ballTrailMaxLength', { min: 0, max: 140, step: 1, label: 'Trail Length' })
  ballVisualFolder.addBinding(params, 'ballTrailWidthScale', { min: 0.2, max: 3, step: 0.05, label: 'Trail Width' })
  ballVisualFolder.addBinding(params, 'ballTrailAlpha', { min: 0, max: 1, step: 0.05, label: 'Trail Alpha' })
  
  const bumpersFolder = addFolder(pane, 'Bumpers')
  addTuningBinding(bumpersFolder, 'bumperRestitution', { min: 0.3, max: 1.8, step: 0.01, label: 'Restitution' }, 'Прыгучесть бамперов. Выше - отскоки от бамперов резче и энергичнее.')
  addTuningBinding(bumpersFolder, 'bumperImpulse', { min: 0, max: 0.4, step: 0.001, label: 'Impulse' }, 'Дополнительная сила при ударе о бампер. Выше - бампер активнее выталкивает мяч.')
  addTuningBinding(bumpersFolder, 'bumperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' }, 'Насколько удар бампера направляется к воротам. Выше - бампер чаще помогает атаковать.')
  addTuningBinding(bumpersFolder, 'bumperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' }, 'Усиление слабых ударов, когда мяч медленный. Выше - меньше вялых контактов и застреваний.')
  addTuningBinding(bumpersFolder, 'bumperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' }, 'Скорость, напрямую добавляемая ударом бампера. Выше - отскоки быстрее, даже без большой силы.')
  addTuningBinding(bumpersFolder, 'bumperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' }, 'Скорость, ниже которой включается усиление слабого удара. Выше - усиление срабатывает чаще.')
  const bumpersTimingFolder = addSecondaryFolder(bumpersFolder, 'Timing')
  addTuningBinding(bumpersTimingFolder, 'contactAntiStallKickScale', { min: 0, max: 4, step: 0.05, label: 'Anti-Stall Kick' }, 'Дополнительный пинок, если мяч почти застрял на контакте. Выше - система агрессивнее освобождает мяч.')
  addTuningBinding(bumpersTimingFolder, 'contactAntiStallCooldownMs', { min: 30, max: 1000, step: 10, label: 'Anti-Stall Cooldown' }, 'Минимальная пауза между anti-stall пинками на одном контакте. Выше - спасательные пинки реже.')
  addTuningBinding(bumpersTimingFolder, 'contactKickCooldownMs', { min: 0, max: 800, step: 10, label: 'Contact Cooldown' }, 'Минимальная пауза между пинками от одного объекта. Выше - меньше повторных быстрых пинков подряд.')
  const bumpersVisualFolder = addSecondaryFolder(bumpersFolder, 'Visual')
  bumpersVisualFolder.addBinding(params, 'bumperHitScale', { min: 0, max: 0.4, step: 0.01, label: 'Hit Squash' })
  bumpersVisualFolder.addBinding(params, 'bumperHitDurationMs', { min: 16, max: 240, step: 4, label: 'Hit Duration' })
  
  const playersFolder = addFolder(pane, 'Players')
  addTuningBinding(playersFolder, 'playerImpulse', { min: 0, max: 0.08, step: 0.001, label: 'Impulse' }, 'Дополнительная сила от столкновения с игроком. Выше - игроки сильнее бьют по мячу.')
  addTuningBinding(playersFolder, 'playerWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' }, 'Усиление удара игрока, когда мяч медленный. Выше - мягкие контакты становятся полезнее.')
  addTuningBinding(playersFolder, 'playerVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' }, 'Скорость, напрямую добавляемая ударом игрока. Выше - мяч резче меняет направление.')
  addTuningBinding(playersFolder, 'playerLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' }, 'Скорость, ниже которой включается усиление слабого удара игрока. Выше - усиление срабатывает чаще.')
  playersFolder.addBinding(params, 'playerMovementEnabled', { label: 'Move Players' })
  playersFolder.addBinding(params, 'playerMovementDistance', { min: 0, max: 80, step: 1, label: 'Move Distance' })
  playersFolder.addBinding(params, 'playerMovementSpeed', { min: 0, max: 6, step: 0.1, label: 'Move Speed' })
  const playersSecondaryFolder = addSecondaryFolder(playersFolder, 'Secondary')
  playersSecondaryFolder.addBinding(params, 'playerHitOffsetPx', { min: 0, max: 24, step: 1, label: 'Hit Offset Px' })
  playersSecondaryFolder.addBinding(params, 'playerHitDurationMs', { min: 20, max: 260, step: 5, label: 'Hit Duration' })
  playersSecondaryFolder.addBinding(params, 'playerMovementParallel', { label: 'Parallel Move' })
  playersSecondaryFolder.addBinding(params, 'playerMovementArcHeight', { min: -120, max: 120, step: 2, label: 'Arc Height' })
  
  const goalkeeperFolder = addFolder(pane, 'Goalkeeper')
  goalkeeperFolder.addBinding(params, 'goalkeeperSpeed', { min: 20, max: 180, step: 1, label: 'Speed' })
  addTuningBinding(goalkeeperFolder, 'goalkeeperImpulse', { min: 0, max: 0.1, step: 0.001, label: 'Impulse' }, 'Дополнительная сила от столкновения с вратарем. Выше - сейвы сильнее выбивают мяч.')
  addTuningBinding(goalkeeperFolder, 'goalkeeperWeakHitBoost', { min: 0, max: 4, step: 0.05, label: 'Weak Hit Boost' }, 'Усиление сейва, когда мяч медленный. Выше - мягкие сейвы увереннее выносят мяч.')
  addTuningBinding(goalkeeperFolder, 'goalkeeperVelocityKick', { min: 0, max: 4, step: 0.05, label: 'Velocity Kick' }, 'Скорость, напрямую добавляемая сейвом. Выше - мяч быстрее отскакивает от вратаря.')
  addTuningBinding(goalkeeperFolder, 'goalkeeperLowSpeedThreshold', { min: 1, max: 20, step: 0.5, label: 'Low Speed Thresh' }, 'Скорость, ниже которой включается усиление сейва. Выше - усиление срабатывает чаще.')
  addTuningBinding(goalkeeperFolder, 'goalkeeperGoalAvoidBias', { min: 0, max: 0.95, step: 0.01, label: 'Avoid Goal Bias' }, 'Насколько сейв направляется прочь от ворот. Выше - вратарь чаще выносит мяч безопасно.')
  const goalkeeperSecondaryFolder = addSecondaryFolder(goalkeeperFolder, 'Secondary')
  goalkeeperSecondaryFolder.addBinding(params, 'goalkeeperHitOffsetPx', { min: 0, max: 28, step: 1, label: 'Hit Offset Px' })
  goalkeeperSecondaryFolder.addBinding(params, 'goalkeeperHitDurationMs', { min: 20, max: 280, step: 5, label: 'Hit Duration' })
  
  const flippersFolder = addFolder(pane, 'Flippers')
  flippersFolder.addBinding(params, 'flipperSpeed', { min: 0.02, max: 0.7, step: 0.01, label: 'Speed' })
  addTuningBinding(flippersFolder, 'flipperKick', { min: 0, max: 0.09, step: 0.001, label: 'Kick' }, 'Дополнительная сила от движущегося флиппера. Выше - контакт с флиппером резче.')
  addTuningBinding(flippersFolder, 'flipperVelocityKick', { min: 0, max: 36, step: 0.5, label: 'Velocity Kick' }, 'Скорость, напрямую добавляемая взмахом флиппера. Выше - удары становятся намного быстрее.')
  addTuningBinding(flippersFolder, 'flipperGoalBias', { min: 0, max: 0.95, step: 0.01, label: 'Goal Bias' }, 'Насколько удар флиппера направляется к воротам. Выше - флипперы чаще целятся вверх.')
  const flippersSecondaryFolder = addSecondaryFolder(flippersFolder, 'Secondary')
  addTuningBinding(flippersSecondaryFolder, 'flipperKickCooldownMs', { min: 0, max: 500, step: 10, label: 'Kick Cooldown' }, 'Минимальная пауза между усиленными ударами флиппера. Выше - меньше повторных бустов в одном контакте.')
  addTuningBinding(flippersSecondaryFolder, 'flipperKickMinAngleStep', { min: 0, max: 0.08, step: 0.002, label: 'Kick Motion Min' }, 'Минимальное движение флиппера, чтобы удар засчитался как активный. Выше - нужен более заметный взмах.')
  addTuningBinding(flippersSecondaryFolder, 'flipperTipBoost', { min: 0, max: 2, step: 0.05, label: 'Tip Boost' }, 'Дополнительная сила ближе к кончику флиппера. Выше - tip shot становится сильнее.')
  addTuningBinding(flippersSecondaryFolder, 'flipperMinTipScale', { min: 0.1, max: 1, step: 0.05, label: 'Base Tip Scale' }, 'Базовая сила флиппера до бонуса за попадание ближе к кончику. Выше - все удары флиппером сильнее.')
  
  const collisionsFolder = addFolder(pane, 'Collisions')
  addTuningBinding(collisionsFolder, 'wallRestitution', { min: 0.05, max: 1.2, step: 0.01, label: 'Wall Rest.' }, 'Прыгучесть стен и статичных объектов. Выше - мяч сохраняет больше скорости после удара о стену.')
  for (const binding of [
    addTuningBinding(collisionsFolder, 'wallPadding', { min: 4, max: 20, step: 1, label: 'Wall Padding' }, 'Дополнительная толщина коллизий стен. Выше - столкновения со стенами происходят раньше и меньше риск пролета сквозь край.'),
    addTuningBinding(collisionsFolder, 'goalPadding', { min: 2, max: 16, step: 1, label: 'Goal Padding' }, 'Дополнительная толщина зон гола и потери. Выше - эти зоны ловят мяч раньше.'),
    addTuningBinding(collisionsFolder, 'playerPadding', { min: 0, max: 8, step: 1, label: 'Player Padding' }, 'Дополнительная толщина коллизий игроков. Выше - по игрокам легче попасть.'),
    addTuningBinding(collisionsFolder, 'bumperPadding', { min: 0, max: 8, step: 1, label: 'Bumper Padding' }, 'Дополнительная толщина коллизий бамперов. Выше - бамперы легче активируются.'),
    addTuningBinding(collisionsFolder, 'flipperPadding', { min: 0, max: 3, step: 0.5, label: 'Flipper Padding' }, 'Дополнительная защитная коллизия вокруг флипперов. Выше - меньше пролетов сквозь флиппер, но он ощущается толще.'),
  ]) {
    binding.on('change', () => {
      const currentScene = scene()
      if (currentScene?.mode === 'play') {
        currentScene.rebuildPlayBodies()
      }
    })
  }
  
  const serveFolder = addFolder(pane, 'Serve')
  serveFolder.addBinding(params, 'launchForceMin', { min: 0, max: 0.12, step: 0.001, label: 'Force Min' })
  serveFolder.addBinding(params, 'launchForceMax', { min: 0, max: 0.12, step: 0.001, label: 'Force Max' })
  serveFolder.addBinding(params, 'launchDelayMs', { min: 0, max: 1200, step: 25, label: 'Delay' })
  const serveSecondaryFolder = addSecondaryFolder(serveFolder, 'Secondary')
  addTuningBinding(serveSecondaryFolder, 'launchXMin', { min: -1, max: 0.5, step: 0.01, label: 'X Min' }, 'Минимальное горизонтальное направление подачи. Чем ниже значение, тем сильнее подача может уходить влево.')
  addTuningBinding(serveSecondaryFolder, 'launchXMax', { min: -0.5, max: 1, step: 0.01, label: 'X Max' }, 'Максимальное горизонтальное направление подачи. Чем выше значение, тем сильнее подача может уходить вправо.')
  addTuningBinding(serveSecondaryFolder, 'launchXDeadZone', { min: 0, max: 0.5, step: 0.005, label: 'X Dead' }, 'Запрещает подачи почти строго вверх. Выше - подача чаще уходит заметно влево или вправо.')
  
  const debugFolder = addFolder(pane, 'Debug', false)
  debugFolder.addBinding(params, 'debugMatterEnabled', { label: 'Matter Debug' })
  debugFolder.addBinding(params, 'showVisualShapes', { label: 'Visual SVG' })
  debugFolder.addBinding(params, 'showMatterBodies', { label: 'Matter Bodies' })
  debugFolder.addBinding(params, 'showSafetyBodies', { label: 'Safety Bodies' })
  debugFolder.addBinding(params, 'showAlignmentCompare', { label: 'Compare Align' })
  debugFolder.addBinding(params, 'showGoalkeeperPath', { label: 'Goalkeeper Path' })
  debugFolder.addBinding(params, 'showLaunchArrow', { label: 'Launch Arrow' })
  debugFolder.addBinding(params, 'showPerfStats', { label: 'Perf Stats' })
  debugFolder.addBinding(params, 'freezePhysics', { label: 'Freeze Physics' })
  
  const shakeFolder = addFolder(pane, 'Camera Shake', false)
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

function createHelpTooltip(container) {
  const element = document.createElement('div')
  element.className = 'tuning-help-tooltip'
  element.setAttribute('role', 'tooltip')
  element.hidden = true
  container.appendChild(element)

  const state = {
    activeButton: null,
    element,
    pinned: false,
  }

  const position = (button) => {
    const rect = button.getBoundingClientRect()
    const tooltipRect = element.getBoundingClientRect()
    const margin = 8
    const preferredLeft = rect.left - tooltipRect.width - margin
    const fallbackLeft = rect.right + margin
    const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin)
    const left = preferredLeft >= margin
      ? preferredLeft
      : Math.max(margin, Math.min(fallbackLeft, maxLeft))
    const top = Math.max(margin, Math.min(rect.top - 6, window.innerHeight - tooltipRect.height - margin))
    element.style.left = `${left}px`
    element.style.top = `${top}px`
  }

  const show = (button, text, pinned = false) => {
    state.activeButton?.classList.remove('is-active')
    state.activeButton?.setAttribute('aria-expanded', 'false')
    state.activeButton = button
    state.pinned = pinned
    element.textContent = text
    element.hidden = false
    button.classList.add('is-active')
    button.setAttribute('aria-expanded', 'true')
    window.requestAnimationFrame(() => position(button))
  }

  const hide = () => {
    state.activeButton?.classList.remove('is-active')
    state.activeButton?.setAttribute('aria-expanded', 'false')
    state.activeButton = null
    state.pinned = false
    element.hidden = true
  }

  document.addEventListener('pointerdown', (event) => {
    if (!state.pinned) {
      return
    }
    if (event.target.closest?.('.tuning-help-button') || element.contains(event.target)) {
      return
    }
    hide()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !element.hidden) {
      hide()
    }
  })

  window.addEventListener('resize', () => {
    if (state.activeButton && !element.hidden) {
      position(state.activeButton)
    }
  })

  return { hide, show, state }
}

function attachHelpButton(binding, tooltip, text) {
  const label = binding.element.querySelector('.tp-lblv_l')
  if (!label) {
    binding.element.title = text
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tuning-help-button'
  button.textContent = '?'
  button.setAttribute('aria-label', `${binding.label || binding.key}: подсказка`)
  button.setAttribute('aria-expanded', 'false')

  button.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (tooltip.state.pinned && tooltip.state.activeButton === button) {
      tooltip.hide()
      return
    }
    tooltip.show(button, text, true)
  })

  label.insertBefore(button, label.firstChild)
}
