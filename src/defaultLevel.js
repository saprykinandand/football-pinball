export const DEFAULT_LEVEL = {
  "version": 1,
  "width": 375,
  "height": 812,
  "source": {
    "fileName": "pinball_layout_v2.svg",
    "viewBox": [
      0,
      0,
      375,
      812
    ],
    "note": "Converted from the Figma SVG export into editable JSON objects. path_of_goal_keeper was not present in v2 SVG and is retained from the previous default layout."
  },
  "ball": {
    "spawn": {
      "x": 188.50992399974876,
      "y": 439.7128712871288
    },
    "radius": 12
  },
  "objects": [
    {
      "name": "ball_spawn",
      "kind": "ball_spawn",
      "fill": "#FFFFFF",
      "point": {
        "x": 188.50992399974876,
        "y": 439.7128712871288
      },
      "radius": 6
    },
    {
      "name": "player_left_instance",
      "kind": "player",
      "sourceIndex": 0,
      "fill": "#0000FF",
      "points": [
        {
          "x": 129,
          "y": 334.84849548339844
        },
        {
          "x": 146,
          "y": 331.84849548339844
        },
        {
          "x": 163,
          "y": 335.84849548339844
        },
        {
          "x": 152,
          "y": 360.84849548339844
        },
        {
          "x": 141,
          "y": 360.84849548339844
        }
      ],
      "side": "left",
      "pair": "player_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "player_right_instance",
      "kind": "player",
      "sourceIndex": 1,
      "fill": "#0000FF",
      "points": [
        {
          "x": 234,
          "y": 360.84849548339844
        },
        {
          "x": 223,
          "y": 360.84849548339844
        },
        {
          "x": 212,
          "y": 335.84849548339844
        },
        {
          "x": 229,
          "y": 331.84849548339844
        },
        {
          "x": 246,
          "y": 334.84849548339844
        }
      ],
      "side": "right",
      "pair": "player_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "player_goalkeeper",
      "kind": "goalkeeper",
      "sourceIndex": 2,
      "fill": "#0000FF",
      "points": [
        {
          "x": 200.732,
          "y": 293.902
        },
        {
          "x": 205,
          "y": 268.902
        },
        {
          "x": 170,
          "y": 268.902
        },
        {
          "x": 173.98,
          "y": 293.902
        }
      ]
    },
    {
      "name": "flipper_right_instance",
      "kind": "flipper",
      "sourceIndex": 3,
      "fill": "#FFFF00",
      "anchor": "anchor_point_flipper_right_instance",
      "points": [
        {
          "x": 291.611,
          "y": 595.487
        },
        {
          "x": 222,
          "y": 630.8484954833984
        },
        {
          "x": 215,
          "y": 619.8484954833984
        },
        {
          "x": 228,
          "y": 598.8484954833984
        },
        {
          "x": 259,
          "y": 563.8484954833984
        },
        {
          "x": 275,
          "y": 558.8484954833984
        },
        {
          "x": 288.715,
          "y": 566.737
        },
        {
          "x": 295.225,
          "y": 576.295
        }
      ],
      "side": "right",
      "pair": "flipper_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "flipper_left_instance",
      "kind": "flipper",
      "sourceIndex": 4,
      "fill": "#FFFF00",
      "anchor": "anchor_point_flipper_left_instance",
      "points": [
        {
          "x": 79.77499999999998,
          "y": 576.295
        },
        {
          "x": 86.28500000000003,
          "y": 566.737
        },
        {
          "x": 100,
          "y": 558.8484954833984
        },
        {
          "x": 116,
          "y": 563.8484954833984
        },
        {
          "x": 147,
          "y": 598.8484954833984
        },
        {
          "x": 160,
          "y": 619.8484954833984
        },
        {
          "x": 153,
          "y": 630.8484954833984
        },
        {
          "x": 83.38900000000001,
          "y": 595.487
        }
      ],
      "side": "left",
      "pair": "flipper_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "anchor_point_flipper_right_instance",
      "kind": "anchor",
      "sourceIndex": 5,
      "fill": "#D9D9D9",
      "point": {
        "x": 269.86724,
        "y": 586.61524
      },
      "radius": 1.31824,
      "side": "right",
      "pair": "anchor_point_flipper_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "anchor_point_flipper_left_instance",
      "kind": "anchor",
      "sourceIndex": 6,
      "fill": "#D9D9D9",
      "point": {
        "x": 105.13276,
        "y": 586.61524
      },
      "radius": 1.31824,
      "side": "left",
      "pair": "anchor_point_flipper_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "bumper_right_instance",
      "kind": "bumper",
      "sourceIndex": 7,
      "fill": "#FF0000",
      "points": [
        {
          "x": 320,
          "y": 506.84849548339844
        },
        {
          "x": 301,
          "y": 513.8484954833984
        },
        {
          "x": 276,
          "y": 522.8484954833984
        },
        {
          "x": 267,
          "y": 511.84849548339844
        },
        {
          "x": 272,
          "y": 502.84849548339844
        },
        {
          "x": 307,
          "y": 441.84849548339844
        },
        {
          "x": 320,
          "y": 435.84849548339844
        },
        {
          "x": 322.9539,
          "y": 441.06
        },
        {
          "x": 321,
          "y": 483.84849548339844
        }
      ],
      "side": "right",
      "pair": "bumper_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "bumper_left_instance",
      "kind": "bumper",
      "sourceIndex": 8,
      "fill": "#FF0000",
      "points": [
        {
          "x": 54,
          "y": 483.84849548339844
        },
        {
          "x": 52.046100000000024,
          "y": 441.06
        },
        {
          "x": 55,
          "y": 435.84849548339844
        },
        {
          "x": 68,
          "y": 441.84849548339844
        },
        {
          "x": 103,
          "y": 502.84849548339844
        },
        {
          "x": 108,
          "y": 511.84849548339844
        },
        {
          "x": 99,
          "y": 522.8484954833984
        },
        {
          "x": 74,
          "y": 513.8484954833984
        },
        {
          "x": 55,
          "y": 506.84849548339844
        }
      ],
      "side": "left",
      "pair": "bumper_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "field_base_left_instance",
      "kind": "field_base",
      "sourceIndex": 9,
      "fill": "black",
      "points": [
        {
          "x": 112.5,
          "y": 662.8484954833984
        },
        {
          "x": 112.5,
          "y": 672.8484954833984
        },
        {
          "x": 0,
          "y": 673.818
        },
        {
          "x": 0,
          "y": 141.879
        },
        {
          "x": 187.5,
          "y": 141.879
        },
        {
          "x": 187.5,
          "y": 208.386
        },
        {
          "x": 107.804,
          "y": 211.836
        },
        {
          "x": 61.6282,
          "y": 219.023
        },
        {
          "x": 38.1565,
          "y": 233.054
        },
        {
          "x": 25.9369,
          "y": 254.214
        },
        {
          "x": 25.9369,
          "y": 576.747
        },
        {
          "x": 31.5,
          "y": 607.8484954833984
        },
        {
          "x": 98.5,
          "y": 647.8484954833984
        }
      ],
      "side": "left",
      "pair": "field_base_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "field_base_right_instance",
      "kind": "field_base",
      "sourceIndex": 10,
      "fill": "black",
      "points": [
        {
          "x": 276.5,
          "y": 647.8484954833984
        },
        {
          "x": 343.5,
          "y": 607.8484954833984
        },
        {
          "x": 349.0631,
          "y": 576.747
        },
        {
          "x": 349.0631,
          "y": 254.214
        },
        {
          "x": 336.8435,
          "y": 233.054
        },
        {
          "x": 313.3718,
          "y": 219.023
        },
        {
          "x": 267.196,
          "y": 211.836
        },
        {
          "x": 187.5,
          "y": 208.386
        },
        {
          "x": 187.5,
          "y": 141.879
        },
        {
          "x": 375,
          "y": 141.879
        },
        {
          "x": 375,
          "y": 673.818
        },
        {
          "x": 262.5,
          "y": 672.8484954833984
        },
        {
          "x": 262.5,
          "y": 662.8484954833984
        }
      ],
      "side": "right",
      "pair": "field_base_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "field_collision_left_instance",
      "kind": "field_collision",
      "sourceIndex": 11,
      "fill": "black",
      "points": [
        {
          "x": 54,
          "y": 356.84849548339844
        },
        {
          "x": 53,
          "y": 384.84849548339844
        },
        {
          "x": 46,
          "y": 395.84849548339844
        },
        {
          "x": 30,
          "y": 402.84849548339844
        },
        {
          "x": 15,
          "y": 407.84849548339844
        },
        {
          "x": 15,
          "y": 320.84849548339844
        },
        {
          "x": 47,
          "y": 339.84849548339844
        }
      ],
      "side": "left",
      "pair": "field_collision_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "field_collision_right_instance",
      "kind": "field_collision",
      "sourceIndex": 12,
      "fill": "black",
      "points": [
        {
          "x": 328,
          "y": 339.84849548339844
        },
        {
          "x": 360,
          "y": 320.84849548339844
        },
        {
          "x": 360,
          "y": 407.84849548339844
        },
        {
          "x": 345,
          "y": 402.84849548339844
        },
        {
          "x": 329,
          "y": 395.84849548339844
        },
        {
          "x": 322,
          "y": 384.84849548339844
        },
        {
          "x": 321,
          "y": 356.84849548339844
        }
      ],
      "side": "right",
      "pair": "field_collision_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "goal_collision_right_instance",
      "kind": "goal_collision",
      "sourceIndex": 13,
      "fill": "black",
      "points": [
        {
          "x": 277.7444,
          "y": 254.707
        },
        {
          "x": 271.7695,
          "y": 257.308
        },
        {
          "x": 265.717,
          "y": 254.707
        },
        {
          "x": 264.7695,
          "y": 252.651
        },
        {
          "x": 264.7695,
          "y": 207.308
        },
        {
          "x": 278.7695,
          "y": 207.308
        },
        {
          "x": 278.7695,
          "y": 252.651
        }
      ],
      "side": "right",
      "pair": "goal_collision_left_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "goal_collision_left_instance",
      "kind": "goal_collision",
      "sourceIndex": 14,
      "fill": "black",
      "points": [
        {
          "x": 96.2305,
          "y": 252.651
        },
        {
          "x": 96.2305,
          "y": 207.308
        },
        {
          "x": 110.2305,
          "y": 207.308
        },
        {
          "x": 110.2305,
          "y": 252.651
        },
        {
          "x": 109.283,
          "y": 254.707
        },
        {
          "x": 103.2305,
          "y": 257.308
        },
        {
          "x": 97.2556,
          "y": 254.707
        }
      ],
      "side": "left",
      "pair": "goal_collision_right_instance",
      "mirrorAxis": 187.5
    },
    {
      "name": "winning_area_goal",
      "kind": "sensor_goal",
      "sourceIndex": 15,
      "fill": "#00FF80",
      "points": [
        {
          "x": 111,
          "y": 196.84849548339844
        },
        {
          "x": 264.0509,
          "y": 194.877
        },
        {
          "x": 264.0509,
          "y": 224.4593
        },
        {
          "x": 111,
          "y": 223.84849548339844
        }
      ]
    },
    {
      "name": "loose_area",
      "kind": "sensor_lose",
      "sourceIndex": 16,
      "fill": "#00FF80",
      "points": [
        {
          "x": 0,
          "y": 673.389
        },
        {
          "x": 375,
          "y": 673.389
        },
        {
          "x": 375,
          "y": 703.3618
        },
        {
          "x": 0,
          "y": 703.3618
        }
      ]
    },
    {
      "name": "path_of_goal_keeper",
      "kind": "goalkeeper_path",
      "sourceIndex": 17,
      "fill": "#00FF80",
      "alpha": 0.18,
      "points": [
        {
          "x": 94.949,
          "y": 192.877
        },
        {
          "x": 280.051,
          "y": 192.877
        },
        {
          "x": 257,
          "y": 193.84849548339844
        },
        {
          "x": 109,
          "y": 193.84849548339844
        }
      ]
    }
  ]
}
