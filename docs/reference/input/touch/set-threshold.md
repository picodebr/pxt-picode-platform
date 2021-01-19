# set Threshold

Set the threshold amount used to detect a that a pin was touched.

```sig
input.touchA1.setThreshold(0)
```
Pins (or pads) on a board used to detect a touch are measured to see how much electrical charge is on them. This measurement happens over a short period of time while a charge builds up when you touch it. To control the amount of charge it takes for the touch circuit to say that a touch happen, you set the touch threshold.

Setting a higher threshold value makes it take longer for a touch event to happen. If you want a touch event to require you to stay on the pin for a while, then set the value to something high. Quick taps on the pin will signal a touch with a lower threshold value.

## Parameters

* **threshold**: a [number](/types/number) that sets the threshold (charge amount) needed to detect that a pin was touched. This is a value between `0` and `1023`.

## Example #example

Set the touch threshold to `1000`. Log a message when a touch is a detected.

```blocks
input.touchA1.setThreshold(1000);
input.touchA1.onEvent(ButtonEvent.Click, function () {
    console.log("Touch pin presssed hard")
})
```

## See also #seealso

[value](/reference/input/touch/value)

```package
touch
```
