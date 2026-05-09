import Phaser from 'phaser'

export function bindControls(scene) {
  // Allow multi-touch so left and right flippers can be held together on phones.
  scene.input.addPointer(3)

  scene.keys = scene.input.keyboard.addKeys({
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    a: Phaser.Input.Keyboard.KeyCodes.A,
    d: Phaser.Input.Keyboard.KeyCodes.D,
    q: Phaser.Input.Keyboard.KeyCodes.Q,
    e: Phaser.Input.Keyboard.KeyCodes.E,
    space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    r: Phaser.Input.Keyboard.KeyCodes.R,
  })

  const leftButton = document.querySelector('#left-flip')
  const rightButton = document.querySelector('#right-flip')
  leftButton.onpointerdown = () => {
    scene.leftPressed = true
  }
  leftButton.onpointerup = () => {
    scene.leftPressed = false
  }
  leftButton.onpointerleave = () => {
    scene.leftPressed = false
  }
  rightButton.onpointerdown = () => {
    scene.rightPressed = true
  }
  rightButton.onpointerup = () => {
    scene.rightPressed = false
  }
  rightButton.onpointerleave = () => {
    scene.rightPressed = false
  }

  const pointerSides = new Map()
  const clearPointerSide = (pointerId) => {
    const side = pointerSides.get(pointerId)
    if (!side) {
      return
    }
    pointerSides.delete(pointerId)
    scene.screenLeftPressed = Array.from(pointerSides.values()).includes('left')
    scene.screenRightPressed = Array.from(pointerSides.values()).includes('right')
  }

  scene.input.on('pointerdown', (pointer) => {
    if (scene.mode !== 'play') {
      return
    }
    const side = pointer.worldX < scene.level.width / 2 ? 'left' : 'right'
    pointerSides.set(pointer.id, side)
    if (side === 'left') {
      scene.screenLeftPressed = true
    } else {
      scene.screenRightPressed = true
    }
  })
  scene.input.on('pointerup', (pointer) => {
    clearPointerSide(pointer.id)
  })
  scene.input.on('pointerupoutside', (pointer) => {
    clearPointerSide(pointer.id)
  })

  scene.input.keyboard.on('keydown-Q', () => scene.rotateSelected(-5))
  scene.input.keyboard.on('keydown-E', () => scene.rotateSelected(5))
  scene.input.keyboard.on('keydown-R', () => scene.serveBall())
}

export function isFlipperHeld(scene, name) {
  if (name.includes('_left_')) {
    return scene.leftPressed || scene.screenLeftPressed || scene.keys.left.isDown || scene.keys.a.isDown
  }
  return scene.rightPressed || scene.screenRightPressed || scene.keys.right.isDown || scene.keys.d.isDown
}
