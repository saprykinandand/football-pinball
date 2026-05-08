export class PerfOverlay {
  constructor(scene) {
    this.scene = scene
    this.frames = 0
    this.elapsedMs = 0
    this.text = scene.add.text(8, 8, '', {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '12px',
      color: '#d8f6d0',
      backgroundColor: 'rgba(7, 26, 14, 0.75)',
      padding: { x: 6, y: 4 },
    })
    this.text.setScrollFactor(0)
    this.text.setDepth(10000)
    this.text.setVisible(false)
  }

  setEnabled(enabled) {
    this.text.setVisible(Boolean(enabled))
    if (!enabled) {
      this.text.setText('')
    }
  }

  update(enabled, delta, visualDelta, details) {
    if (!enabled) {
      if (this.text.visible) {
        this.setEnabled(false)
      }
      return
    }

    this.frames += 1
    this.elapsedMs += delta
    if (this.elapsedMs < 250) {
      return
    }

    const fps = Math.round((this.frames * 1000) / this.elapsedMs)
    this.frames = 0
    this.elapsedMs = 0
    this.text.setVisible(true)
    this.text.setText([
      `FPS ${fps}`,
      `Bodies ${details.bodyCount}`,
      `Delta ${Math.round(delta)}>${Math.round(visualDelta)}ms`,
      `Matter debug ${details.debugOn ? 'on' : 'off'}`,
      `Deferred ${details.deferredUpdates || 0}`,
    ].join('\n'))
  }
}
