import Phaser from 'phaser'
import { clone } from '../level/levelStore.js'
import { cleanPoints, mirrorPoints, pointNearPolygon, polygonCenter, rotatePoint, translatePoints } from '../level/geometry.js'

const EDIT_HANDLE_RADIUS = 7

export function bindEditInput(scene) {
  scene.input.on('pointerdown', (pointer) => {
    if (scene.mode !== 'edit') {
      return
    }

    const point = { x: pointer.worldX, y: pointer.worldY }
    const selected = scene.getSelectedObject()
    const vertexHit = selected?.points ? findVertexHit(scene, selected, point) : -1
    if (vertexHit >= 0) {
      scene.dragState = { type: 'vertex', name: selected.name, index: vertexHit, last: point }
      return
    }

    const hit = findObjectAt(scene, point)
    scene.selectedName = hit?.name || null
    scene.updateSelectionUi()
    if (!hit) {
      return
    }

    scene.dragState = { type: hit.point ? 'point' : 'object', name: hit.name, last: point }
  })

  scene.input.on('pointermove', (pointer) => {
    if (scene.mode !== 'edit' || !scene.dragState || !pointer.isDown) {
      return
    }

    const point = { x: pointer.worldX, y: pointer.worldY }
    const object = scene.findObject(scene.dragState.name)
    if (!object) {
      return
    }

    if (scene.dragState.type === 'vertex') {
      object.points[scene.dragState.index] = point
    } else {
      const dx = point.x - scene.dragState.last.x
      const dy = point.y - scene.dragState.last.y
      translateObject(object, dx, dy)
      scene.dragState.last = point
    }

    afterObjectEdit(scene, object)
  })

  scene.input.on('pointerup', () => {
    scene.dragState = null
  })
}

export function drawEditOverlay(scene) {
  if (scene.mode !== 'edit') {
    return
  }

  const selected = scene.getSelectedObject()
  if (!selected) {
    return
  }

  scene.editGraphics.lineStyle(3, 0xffffff, 1)
  if (selected.points) {
    strokeSelection(scene, selected.points)
    for (const point of cleanPoints(selected.points)) {
      scene.editGraphics.fillStyle(0xffffff, 1)
      scene.editGraphics.fillCircle(point.x, point.y, EDIT_HANDLE_RADIUS)
      scene.editGraphics.fillStyle(0x111111, 1)
      scene.editGraphics.fillCircle(point.x, point.y, 3)
    }
  } else if (selected.point) {
    scene.editGraphics.strokeCircle(selected.point.x, selected.point.y, 12)
    scene.editGraphics.fillStyle(0xffffff, 1)
    scene.editGraphics.fillCircle(selected.point.x, selected.point.y, EDIT_HANDLE_RADIUS)
  }
}

function strokeSelection(scene, points) {
  const clean = cleanPoints(points)
  scene.editGraphics.beginPath()
  scene.editGraphics.moveTo(clean[0].x, clean[0].y)
  for (let index = 1; index < clean.length; index += 1) {
    scene.editGraphics.lineTo(clean[index].x, clean[index].y)
  }
  scene.editGraphics.closePath()
  scene.editGraphics.strokePath()
}

export function findObjectAt(scene, point) {
  for (let index = scene.level.objects.length - 1; index >= 0; index -= 1) {
    const object = scene.level.objects[index]
    if (object.point) {
      const radius = object.kind === 'anchor' ? 12 : Math.max(object.radius || 4, 8)
      if (Phaser.Math.Distance.Between(point.x, point.y, object.point.x, object.point.y) <= radius) {
        return object
      }
    } else if (object.points && pointNearPolygon(point, object.points, 8)) {
      return object
    }
  }
  return null
}

export function findVertexHit(_scene, object, point) {
  const points = cleanPoints(object.points)
  return points.findIndex((vertex) => Phaser.Math.Distance.Between(point.x, point.y, vertex.x, vertex.y) <= EDIT_HANDLE_RADIUS + 2)
}

export function translateObject(object, dx, dy) {
  if (object.point) {
    object.point.x += dx
    object.point.y += dy
  } else {
    object.points = translatePoints(object.points, dx, dy)
  }
}

export function rotateSelected(scene, degrees) {
  if (scene.mode !== 'edit') {
    return
  }

  const object = scene.getSelectedObject()
  if (!object?.points) {
    return
  }

  const center = object.kind === 'flipper'
    ? scene.findObject(object.anchor)?.point || polygonCenter(object.points)
    : polygonCenter(object.points)
  const radians = Phaser.Math.DegToRad(degrees)
  object.points = object.points.map((point) => rotatePoint(point, center, radians))
  afterObjectEdit(scene, object)
}

export function afterObjectEdit(scene, object) {
  if (object.kind === 'ball_spawn' && object.point) {
    scene.level.ball = scene.level.ball || {}
    scene.level.ball.spawn = { ...object.point }
  }
  syncSharedSource(scene, object)
  syncMirrorPair(scene, object)
  scene.updateSelectionUi()
  scene.markStaticRenderDirty()
  scene.autosaveLevelSoon()
}

export function syncSharedSource(scene, object) {
  if (object.sourceIndex === undefined) {
    return
  }

  for (const other of scene.level.objects) {
    if (other === object || other.sourceIndex !== object.sourceIndex) {
      continue
    }
    if (object.points && other.points) {
      other.points = clone(object.points)
    }
    if (object.point && other.point) {
      other.point = clone(object.point)
    }
  }
}

export function syncMirrorPair(scene, object) {
  if (!object.pair) {
    return
  }

  const paired = scene.findObject(object.pair)
  if (!paired) {
    return
  }

  const axis = scene.level.width / 2
  object.mirrorAxis = axis
  paired.mirrorAxis = axis
  if (object.points && paired.points) {
    paired.points = mirrorPoints(object.points, axis)
  } else if (object.point && paired.point) {
    paired.point = { x: axis * 2 - object.point.x, y: object.point.y }
  }
}
