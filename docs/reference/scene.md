# Scene

Set scene backgrounds and view perspective. Handle interactions between tiles and sprites.

## Screen Settings

```cards
scene.screenWidth()
scene.screenHeight()
scene.setBackgroundColor(0)
scene.setBackgroundImage(null)
scene.backgroundColor()
scene.backgroundImage()
```

## Tiles and Tilemaps

```cards
scene.setTile(0, null)
scene.setTileMap(null)
scene.setTileAt(null, 0)
scene.getTile(0, 0)
scene.getTilesByType(0)
scene.getTile(0, 0).place(null)
scene.placeOnRandomTile(null, 0)
scene.onHitTile(0, 0, function (sprite) {})
sprites.create(null).isHittingTile(CollisionDirection.Left)
sprites.create(null).tileHitFrom(CollisionDirection.Left)
```

## Screen Effects

```cards
effects.confetti.startScreenEffect()
effects.confetti.endScreenEffect()
```

## Camera View

```cards
scene.cameraFollowSprite(null)
scene.centerCameraAt(0, 0)
scene.cameraShake(4,500)
```

## See also

[screen width](/reference/scene/screen-width),
[screen height](/reference/scene/screen-height),
[set background color](/reference/scene/set-background-color),
[set background image](/reference/scene/set-background-image),
[background color](/reference/scene/background-color),
[background image](/reference/scene/background-image),
[set tile](/reference/scene/set-tile),
[set tile map](/reference/scene/set-tile-map),
[set tile at](/reference/scene/set-tile-at),
[get tile](/reference/scene/get-tile),
[get tiles by type](/reference/scene/get-tiles-by-type),
[place](/reference/scene/place),
[place on random tile](/reference/scene/place-on-random-tile),
[on hit tile](/reference/scene/on-hit-tile),
[is hitting tile](/reference/sprites/sprite-is-hittint-tile),
[tile hit from](/reference/sprites/sprite/tile-hit-from),
[start screen effect](/reference/scene/start-screen-effect),
[end screen effect](/reference/scene/end-screen-effect),
[camera follow sprite](/reference/scene/camera-follow-sprite),
[center camera at](/reference/scene/center-camera-at),
[camera shake](/reference/scene/camera-shake)
