import Phaser from 'phaser'
import { params } from '../config/runtimeParams.js'
import { boundsCenter, cleanPoints, pointsBounds } from '../level/geometry.js'

const MatterBody = Phaser.Physics.Matter.Matter.Body
const MatterVertices = Phaser.Physics.Matter.Matter.Vertices

export function matterCentroid(points) {
  const center = MatterVertices.centre(cleanPoints(points))
  return { x: center.x, y: center.y }
}

export function createPolygonBody(scene, object, options) {
  const {
    removeCollinear = 0.01,
    minimumArea = 10,
    ...bodyOptions
  } = options
  const points = cleanPoints(object.points)
  const center = matterCentroid(points)
  const body = scene.matter.add.fromVertices(center.x, center.y, points, {
    label: object.name,
    restitution: params.wallRestitution,
    slop: 0.03,
    ...bodyOptions,
  }, true, removeCollinear, minimumArea)
  tagBody(body, object)
  scene.playBodies.push(body)
  scene.objectBodies.set(object.name, body)
  return body
}

export function alignBodyToSourceBounds(body, sourcePoints) {
  const sourceCenter = boundsCenter(pointsBounds(sourcePoints))
  const bodyCenter = boundsCenter(getBodyBounds(body))
  MatterBody.translate(body, {
    x: sourceCenter.x - bodyCenter.x,
    y: sourceCenter.y - bodyCenter.y,
  })
}

export function getBodyBounds(body) {
  const parts = body.parts?.length > 1 ? body.parts.slice(1) : [body]
  const vertices = parts.flatMap((part) => part.vertices)
  return pointsBounds(vertices)
}

export function createEdgeLoop(scene, object, thickness, options = {}) {
  const { safety = false, ...bodyOptions } = options
  const points = cleanPoints(object.points)
  const bodies = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const length = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y)
    if (length < 1) {
      continue
    }

    const body = scene.matter.add.rectangle(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      length,
      thickness,
      {
        label: object.name,
        isStatic: true,
        restitution: params.wallRestitution,
        friction: 0,
        slop: 0.03,
        angle: Math.atan2(end.y - start.y, end.x - start.x),
        ...bodyOptions,
      },
    )
    tagBody(body, object, { safety })
    scene.playBodies.push(body)
    if (safety) {
      scene.safetyBodies.push(body)
    }
    bodies.push(body)
  }
  return bodies
}

export function tagBody(body, object, options = {}) {
  const parts = body.parts?.length ? body.parts : [body]
  for (const part of parts) {
    part.label = object.name
    part.plugin = { levelName: object.name, kind: object.kind, safety: Boolean(options.safety) }
    part.render.lineColor = options.safety ? 0xffb000 : 0x36a3ff
    part.render.lineOpacity = options.safety ? 0.95 : 0.75
    part.render.lineThickness = options.safety ? 1 : 1
    part.render.fillOpacity = 0
  }
  body.plugin = { levelName: object.name, kind: object.kind, safety: Boolean(options.safety) }
  body.render.lineColor = options.safety ? 0xffb000 : 0x36a3ff
  body.render.lineOpacity = options.safety ? 0.95 : 0.75
  body.render.lineThickness = options.safety ? 1 : 1
  body.render.fillOpacity = 0
}
