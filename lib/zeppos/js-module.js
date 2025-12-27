// Check if we're on device (watch) or side (phone)
// On device: @zos/ble is available
// On side: messaging API is available
export function isHmUIDefined() {
  return typeof hmUI !== 'undefined'
}

export function isHmBleDefined() {
  // Check if messaging exists (side app) - if so, we're NOT on device
  if (typeof messaging !== 'undefined') return false
  // Otherwise assume we're on device with @zos/ble available
  return true
}

export function isHmTimerDefined() {
  return typeof timer !== 'undefined'
}

export function isHmFsDefined() {
  return typeof hmFS !== 'undefined'
}

export function isHmAppDefined() {
  // If messaging exists, we're on side app, not device
  return typeof messaging === 'undefined'
}

export function isHmSensorDefined() {
  return typeof hmSensor !== 'undefined'
}

export function isHmSettingDefined() {
  return typeof hmSetting !== 'undefined'
}
