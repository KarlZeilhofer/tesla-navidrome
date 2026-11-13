// Reserve zero for mute; use the remaining travel for the audible -30..0 dB range.
const MIN_DB = -30

export function sliderToVolume(position) {
  const percent = Math.max(0, Math.min(100, Number(position) || 0))
  return percent === 0 ? 0 : 10 ** ((MIN_DB * (1 - (Math.max(1, percent) - 1) / 99)) / 20)
}

export function volumeToSlider(volume) {
  const gain = Math.max(0, Math.min(1, Number(volume) || 0))
  return gain === 0 ? 0 : Math.max(1, Math.min(100, 1 + 99 * (1 - (20 * Math.log10(gain)) / MIN_DB)))
}
