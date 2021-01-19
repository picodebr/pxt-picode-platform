# set Flag

Set a sprite flag to ``on`` or ``off``.

```sig
sprites.create(null).setFlag(0, false)
```

Sprite flags are settings that change the way a sprite reacts on the screen. When sprites are created they have default behaviors that are set by these flags. The flags determine if a sprite is forced to always stay on the screen or if it gets destroyed when moves off of the screen. Another behavior is _ghosting_ which causes the sprite to not overlap other sprites or collide with obstacles.

## Parameters

* **flag**: the sprite flag to turn on or off. The flags are:
>* ``stay in screen``: the sprite is forced to stay on the screen when it reaches a screen edge
>* ``ghost``: the sprite never overlaps other sprites and won't collide with obstacles
>* ``auto destroy``: the sprite is automatically destroyed when it moves off the screen
>* ``destroy on wall``: the sprite is automatically destroyed when it collides with a wall tile
>* ``bounce on wall``: the sprite will deflect when it collides with a wall tile
>* ``show physics``: the sprite will display its position, velocity, and acceleration below it
>* ``invisible``: the sprite will not be drawn to the screen
>* ``relative to camera``: the sprite is drawn relative to the camera rather than relative to the world and the sprite never overlaps other sprites or collide with obstacles. This is useful for drawing static elements to the screen (scores, dialog boxes, etc.) that shouldn't move when the camera pans

## ~hint

**Scene or Screen?**

A sprite will always stay inside the limits of your scene if your game has a tilemap. Setting the ``stay in screen`` flag to `false` will not let your sprite keep moving past the edge of the game scene. If the scene is larger than the screen and you have ``auto destroy`` set to `true`, the sprite will destroy itself when it moves past the edge of the screen even though it's still inside the scene.

## ~

## Example #example

Create a scene with orange wall tiles. Make the scene be slightly wider than the screen. Move a sprite from the left side of the screen toward the right side. Set the sprite to be a ``ghost`` so it passes through the wall and make it ``auto destroy`` when it moves past the screen.

```blocks
namespace SpriteKind {
    export const Example = SpriteKind.create()
}
let ghost = sprites.create(img`
. . . . . . d d d d d . . . . .
. . . d d d d 1 1 1 d d d . . .
. . d d 1 1 1 1 1 1 1 1 d d . .
. . d 1 1 1 1 1 1 1 1 1 1 d . .
. . d 1 1 1 1 1 1 1 1 1 1 d d .
. d d 1 1 1 f 1 1 1 f 1 1 1 d .
. d 1 1 1 1 1 1 1 1 1 1 1 1 d d
. d 1 1 1 1 1 1 1 1 1 1 1 1 1 d
. d 1 1 1 1 1 1 1 1 1 1 1 1 1 d
d d 1 1 1 1 1 1 f f 1 1 1 1 1 d
d 1 1 1 1 1 1 1 f f 1 1 1 1 1 d
d 1 1 1 1 1 1 1 1 1 1 1 1 1 1 d
d 1 1 1 1 1 1 1 d 1 1 1 1 1 1 d
d 1 d d d 1 1 d d d d 1 d 1 1 d
d d d . d d d d . . d d d d d d
d d . . . d d . . . . d . . d d
`, SpriteKind.Example)
let tileMap: Image = null
let orangeBlock: Image = null
orangeBlock = image.create(16, 16)
orangeBlock.fill(4)
orangeBlock.drawRect(0, 0, 16, 16, 11)
scene.setTile(1, orangeBlock, true)
tileMap = image.create(scene.screenWidth() / 16 + 1, scene.screenHeight() / 16)
tileMap.drawLine(scene.screenWidth() / 32, 0, scene.screenWidth() / 32, scene.screenHeight() / 16, 1)
scene.setTileMap(tileMap)
ghost.setFlag(SpriteFlag.AutoDestroy, true)
ghost.setFlag(SpriteFlag.Ghost, true)
ghost.left = 0
ghost.vx = 40
```

## See also #seealso

[set tile](/reference/scene/set-tile)
