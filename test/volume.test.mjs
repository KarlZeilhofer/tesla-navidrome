import assert from "node:assert/strict"
import test from "node:test"
import { sliderToVolume, volumeToSlider } from "../src/volume.js"

test("logarithmic volume has mute/max endpoints and reversible dB steps", () => {
  assert.equal(sliderToVolume(0), 0)
  assert.equal(sliderToVolume(100), 1)
  assert.equal(volumeToSlider(0), 0)
  assert.equal(volumeToSlider(1), 100)
  assert.ok(Math.abs(sliderToVolume(1) - 10 ** (-30 / 20)) < 1e-9)
  assert.ok(sliderToVolume(50) > 0.15 && sliderToVolume(50) < 0.2)
  assert.equal(volumeToSlider(0.001), 1)
  for (const position of [1, 10, 25, 50, 75, 99]) {
    assert.ok(Math.abs(volumeToSlider(sliderToVolume(position)) - position) < 1e-9)
  }
  // Equal slider steps multiply the amplitude by the same factor.
  const firstRatio = sliderToVolume(50) / sliderToVolume(25)
  const secondRatio = sliderToVolume(75) / sliderToVolume(50)
  assert.ok(Math.abs(firstRatio - secondRatio) < 1e-9)
})
