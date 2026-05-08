export const DRAW_ORDER = [
  'field_base',
  'field_collision',
  'goal_collision',
  'sensor_goal',
  'goalkeeper_path',
  'sensor_lose',
  'bumper',
  'player',
  'goalkeeper',
  'flipper',
  'anchor',
  'ball_spawn',
]

export const PLAY_STATIC_DRAW_ORDER = [
  'field_base',
  'field_collision',
  'goal_collision',
  'sensor_goal',
  'goalkeeper_path',
  'sensor_lose',
  'anchor',
  'ball_spawn',
]

export const PLAY_DYNAMIC_DRAW_ORDER = [
  'bumper',
  'player',
  'goalkeeper',
  'flipper',
]

export function colorToNumber(color) {
  return Number.parseInt(String(color || '#FFFFFF').replace('#', ''), 16)
}
