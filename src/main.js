import './style.css'
import Phaser from 'phaser'
import { Pane } from 'tweakpane'

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="game-shell">
    <div id="game-container"></div>
    <div class="touch-controls">
      <button id="left-flip">Left Flipper</button>
      <button id="right-flip">Right Flipper</button>
    </div>
  </div>
`

const params = {
  gravityY: 1.15,
  ballRestitution: 0.72,
  bumperRestitution: 1.12,
  wallRestitution: 0.55,
  flipperPower: 0.0029,
}

class PinballScene extends Phaser.Scene {
  constructor() {
    super('pinball')
    this.fieldWidth = 420
    this.fieldHeight = 760
    this.leftPressed = false
    this.rightPressed = false
  }

  create() {
    this.cameras.main.setBackgroundColor(0x145b2f)
    this.matter.world.setGravity(0, params.gravityY)

    this.graphics = this.add.graphics()
    this.createStaticBounds()
    this.createBumpers()
    this.createFlippers()
    this.createBall()
    this.bindControls()
  }

  createStaticBounds() {
    const w = this.fieldWidth
    const h = this.fieldHeight

    this.staticBodies = {
      top: this.matter.add.rectangle(w / 2, 12, w - 24, 24, {
        isStatic: true,
        restitution: params.wallRestitution,
      }),
      left: this.matter.add.rectangle(12, h / 2, 24, h - 24, {
        isStatic: true,
        restitution: params.wallRestitution,
      }),
      right: this.matter.add.rectangle(w - 12, h / 2, 24, h - 24, {
        isStatic: true,
        restitution: params.wallRestitution,
      }),
      bottomRail: this.matter.add.rectangle(w / 2, h - 18, w - 90, 20, {
        isStatic: true,
        restitution: params.wallRestitution,
      }),
      launchGuide: this.matter.add.rectangle(w - 52, h / 2, 10, h - 120, {
        isStatic: true,
        restitution: params.wallRestitution,
      }),
    }
  }

  createBumpers() {
    this.bumpers = [
      this.createTriangleBody(110, 225, 60),
      this.createTriangleBody(210, 165, 60),
      this.createTriangleBody(300, 245, 60),
    ]
  }

  createTriangleBody(x, y, size) {
    const body = this.matter.add.polygon(x, y, 3, size / 2, {
      isStatic: true,
      restitution: params.bumperRestitution,
      friction: 0,
      frictionStatic: 0,
      angle: Math.PI / 2,
    })
    return body
  }

  createFlippers() {
    const h = this.fieldHeight
    const flipperLength = 96
    const flipperHeight = 18

    this.leftFlipper = this.matter.add.rectangle(140, h - 98, flipperLength, flipperHeight, {
      restitution: 0.3,
      friction: 0,
      frictionAir: 0.012,
      density: 0.0025,
      chamfer: { radius: 8 },
    })
    this.rightFlipper = this.matter.add.rectangle(280, h - 98, flipperLength, flipperHeight, {
      restitution: 0.3,
      friction: 0,
      frictionAir: 0.012,
      density: 0.0025,
      chamfer: { radius: 8 },
    })

    this.leftPivot = this.matter.add.constraint(this.leftFlipper, { x: 96, y: h - 98 }, 0, 1, {
      pointA: { x: -44, y: 0 },
      damping: 0,
      stiffness: 1,
    })
    this.rightPivot = this.matter.add.constraint(this.rightFlipper, { x: 324, y: h - 98 }, 0, 1, {
      pointA: { x: 44, y: 0 },
      damping: 0,
      stiffness: 1,
    })
  }

  createBall() {
    this.ball = this.matter.add.circle(this.fieldWidth - 28, this.fieldHeight - 70, 13, {
      restitution: params.ballRestitution,
      friction: 0.008,
      frictionAir: 0.0022,
      density: 0.0019,
    })
    this.ball.circleRadius = 13
  }

  bindControls() {
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    })

    const leftButton = document.querySelector('#left-flip')
    const rightButton = document.querySelector('#right-flip')
    leftButton.addEventListener('pointerdown', () => {
      this.leftPressed = true
    })
    leftButton.addEventListener('pointerup', () => {
      this.leftPressed = false
    })
    leftButton.addEventListener('pointerleave', () => {
      this.leftPressed = false
    })
    rightButton.addEventListener('pointerdown', () => {
      this.rightPressed = true
    })
    rightButton.addEventListener('pointerup', () => {
      this.rightPressed = false
    })
    rightButton.addEventListener('pointerleave', () => {
      this.rightPressed = false
    })
  }

  update() {
    this.matter.world.engine.gravity.y = params.gravityY
    this.ball.restitution = params.ballRestitution
    for (const bumper of this.bumpers) {
      bumper.restitution = params.bumperRestitution
    }
    for (const wall of Object.values(this.staticBodies)) {
      wall.restitution = params.wallRestitution
    }

    const leftHeld = this.leftPressed || this.keys.left.isDown || this.keys.a.isDown
    const rightHeld = this.rightPressed || this.keys.right.isDown || this.keys.d.isDown

    if (leftHeld) {
      this.leftFlipper.torque -= params.flipperPower
    } else {
      this.leftFlipper.torque += params.flipperPower * 0.4
    }

    if (rightHeld) {
      this.rightFlipper.torque += params.flipperPower
    } else {
      this.rightFlipper.torque -= params.flipperPower * 0.4
    }

    if (this.keys.space.isDown && this.ball.position.y > this.fieldHeight - 180) {
      this.ball.force.y -= 0.015
    }

    this.constrainFlipperAngles()
    this.drawPlayfield()
  }

  constrainFlipperAngles() {
    const leftMin = -0.85
    const leftMax = 0.35
    const rightMin = -0.35
    const rightMax = 0.85

    if (this.leftFlipper.angle < leftMin || this.leftFlipper.angle > leftMax) {
      this.leftFlipper.angularVelocity *= 0.4
    }

    if (this.rightFlipper.angle < rightMin || this.rightFlipper.angle > rightMax) {
      this.rightFlipper.angularVelocity *= 0.4
    }
  }

  drawPlayfield() {
    this.graphics.clear()
    this.graphics.lineStyle(4, 0xc7e8c0, 1)
    this.graphics.strokeRect(6, 6, this.fieldWidth - 12, this.fieldHeight - 12)

    this.graphics.fillStyle(0x40ad66, 1)
    for (const bumper of this.bumpers) {
      const verts = bumper.vertices
      this.graphics.beginPath()
      this.graphics.moveTo(verts[0].x, verts[0].y)
      this.graphics.lineTo(verts[1].x, verts[1].y)
      this.graphics.lineTo(verts[2].x, verts[2].y)
      this.graphics.closePath()
      this.graphics.fillPath()
    }

    this.graphics.fillStyle(0xf4f4f4, 1)
    this.graphics.fillCircle(this.ball.position.x, this.ball.position.y, this.ball.circleRadius)

    this.drawBodyRect(this.leftFlipper, 0xe7d458)
    this.drawBodyRect(this.rightFlipper, 0xe7d458)
  }

  drawBodyRect(body, color) {
    const verts = body.vertices
    this.graphics.fillStyle(color, 1)
    this.graphics.beginPath()
    this.graphics.moveTo(verts[0].x, verts[0].y)
    this.graphics.lineTo(verts[1].x, verts[1].y)
    this.graphics.lineTo(verts[2].x, verts[2].y)
    this.graphics.lineTo(verts[3].x, verts[3].y)
    this.graphics.closePath()
    this.graphics.fillPath()
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 420,
  height: 760,
  backgroundColor: '#145b2f',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: params.gravityY },
      debug: true,
    },
  },
  scene: PinballScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    orientation: Phaser.Scale.PORTRAIT,
  },
})

const pane = new Pane({ title: 'Physics Debug' })
pane.element.classList.add('debug-pane')
pane.addBinding(params, 'gravityY', { min: 0.2, max: 2.2, step: 0.01, label: 'Gravity Y' })
pane.addBinding(params, 'ballRestitution', { min: 0.2, max: 1.2, step: 0.01, label: 'Ball Rest.' })
pane.addBinding(params, 'bumperRestitution', { min: 0.8, max: 1.5, step: 0.01, label: 'Bumper Rest.' })
pane.addBinding(params, 'wallRestitution', { min: 0.1, max: 1, step: 0.01, label: 'Wall Rest.' })
pane.addBinding(params, 'flipperPower', { min: 0.0015, max: 0.0055, step: 0.0001, label: 'Flipper Power' })

window.addEventListener('beforeunload', () => {
  game.destroy(true)
  pane.dispose()
})
