export function cleanPoints(points) {
  const next = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
  if (next.length > 2) {
    const first = next[0]
    const last = next[next.length - 1]
    if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
      next.pop()
    }
  }
  return next
}

export function polygonCenter(points) {
  const clean = cleanPoints(points)
  const total = clean.reduce((sum, point) => {
    sum.x += point.x
    sum.y += point.y
    return sum
  }, { x: 0, y: 0 })
  return { x: total.x / clean.length, y: total.y / clean.length }
}

export function pointsBounds(points) {
  const clean = cleanPoints(points)
  return clean.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

export function boundsCenter(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

export function translatePoints(points, dx, dy) {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
}

export function rotatePoint(point, center, radians) {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  }
}

export function mirrorPoints(points, axis) {
  return points.map((point) => ({ x: axis * 2 - point.x, y: point.y })).reverse()
}

export function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  const t = Math.max(0, Math.min(1, rawT))
  const x = start.x + t * dx
  const y = start.y + t * dy
  return Math.hypot(point.x - x, point.y - y)
}

export function pointInPolygon(point, points) {
  const clean = cleanPoints(points)
  let inside = false
  for (let index = 0, previous = clean.length - 1; index < clean.length; previous = index, index += 1) {
    const currentPoint = clean[index]
    const previousPoint = clean[previous]
    const intersects = currentPoint.y > point.y !== previousPoint.y > point.y
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

export function pointNearPolygon(point, points, threshold) {
  const clean = cleanPoints(points)
  if (pointInPolygon(point, clean)) {
    return true
  }
  return clean.some((start, index) => distanceToSegment(point, start, clean[(index + 1) % clean.length]) <= threshold)
}
