const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exitBtn = document.getElementById("exitBtn");
const findLedBtn = document.getElementById("findLedBtn");
const testLedBtn = document.getElementById("testLedBtn");
const saveIpBtn = document.getElementById("saveIpBtn");
const forgetIpBtn = document.getElementById("forgetIpBtn");
const retryDiscoveryBtn = document.getElementById("retryDiscoveryBtn");
const manualIpBtn = document.getElementById("manualIpBtn");
const lookSelect = document.getElementById("lookSelect");
const displaySelect = document.getElementById("displaySelect");
const windowModeSelect = document.getElementById("windowModeSelect");
const esp32HostInput = document.getElementById("esp32HostInput");
const volumeValue = document.getElementById("volumeValue");
const bassValue = document.getElementById("bassValue");
const trebleValue = document.getElementById("trebleValue");
const captureBackdrop = document.getElementById("captureBackdrop");
const capturePreview = document.getElementById("capturePreview");
const captureDebugText = document.getElementById("captureDebugText");
const paletteSwatchPrimary = document.getElementById("paletteSwatchPrimary");
const paletteSwatchSecondary = document.getElementById("paletteSwatchSecondary");
const paletteSwatchTertiary = document.getElementById("paletteSwatchTertiary");
const paletteDebugText = document.getElementById("paletteDebugText");
const esp32StatusText = document.getElementById("esp32StatusText");
const esp32SetupText = document.getElementById("esp32SetupText");
const esp32SetupPanel = document.querySelector(".esp32-setup");
const glowRing = document.getElementById("glowRing");
const canvas = document.getElementById("spectrumCanvas");
const ctx = canvas.getContext("2d");
const rootStyle = document.documentElement.style;
const body = document.body;
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));

const modeProfiles = {
  "living-breath": {
    ledMode: "living_breath",
    levelGain: 1.25,
    bandLift: { bass: 0.18, mid: 0.08, treble: 0.025 },
    ringGain: 0.72,
    eventGain: 0.58,
    smoothing: 0.085,
    paletteIntervalMs: 650
  },
  "lava-lamp": {
    ledMode: "ambient",
    levelGain: 0.55,
    bandLift: { bass: 0.04, mid: 0.03, treble: 0.01 },
    ringGain: 0.34,
    eventGain: 0.22,
    smoothing: 0.12,
    paletteIntervalMs: 900
  },
  "audio-orb": {
    ledMode: "audio_orb",
    levelGain: 1.95,
    bandLift: { bass: 0.34, mid: 0.12, treble: 0.04 },
    ringGain: 1,
    eventGain: 0.88,
    smoothing: 0.065,
    paletteIntervalMs: 420
  },
  "diagnostic-meter": {
    ledMode: "diagnostic_meter",
    levelGain: 2.65,
    bandLift: { bass: 0.36, mid: 0.18, treble: 0.08 },
    ringGain: 0.85,
    eventGain: 1,
    smoothing: 0.07,
    paletteIntervalMs: 550
  },
  calibration: {
    ledMode: "solid_test",
    levelGain: 0.9,
    bandLift: { bass: 0.02, mid: 0.02, treble: 0.02 },
    ringGain: 0.35,
    eventGain: 0.2,
    smoothing: 0.12,
    paletteIntervalMs: 1200
  }
};

const ESP32_IP = window.localStorage.getItem("esp32Host") || "";
const ESP32_PORT = Number.parseInt(window.localStorage.getItem("esp32UdpPort"), 10) || 4210;
const LED_SMOOTHING = Number.parseFloat(window.localStorage.getItem("esp32LedSmoothing")) || 0.18;
const LED_BRIGHTNESS_LIMIT = Number.parseInt(window.localStorage.getItem("esp32BrightnessLimit"), 10) || 100;
const LED_MODE = "living_breath";

const esp32Bridge = {
  enabled: true,
  host: ESP32_IP,
  udpPort: ESP32_PORT,
  brightnessLimit: LED_BRIGHTNESS_LIMIT,
  ledMode: LED_MODE,
  smoothing: LED_SMOOTHING,
  ledCount: 60,
  minSendIntervalMs: 50,
  lastUdpSentAt: 0,
  lastHeartbeatAt: 0,
  udpPacketCount: 0,
  udpErrorCount: 0,
  udpStartedLogged: false,
  smoothedLoudness: 0,
  smoothedBass: 0,
  smoothedTreble: 0,
  lastLevel: -1,
  lastBass: -1,
  lastMid: -1,
  lastTreble: -1,
  lastPaletteSignature: "",
  lastEvent: "none",
  lastSentAt: 0,
  sendTimer: 0,
  requestInFlight: false,
  pendingPayload: null,
  nextSequence: 1,
  sentCount: 0,
  ackCount: 0,
  failCount: 0,
  statusTimer: 0,
  lastStatus: null,
  currentLevel: 0,
  currentBass: 0,
  currentMid: 0,
  currentTreble: 0,
  bassAverage: 0,
  trebleAverage: 0,
  loudnessAverage: 0,
  lastBeatAt: 0,
  lastTrebleHitAt: 0,
  lastPeakAt: 0,
  lastQuietAt: 0
};

let audioContext;
let analyser;
let mediaStream;
let captureVideo;
let animationFrame = 0;
let frequencyData;
let volumePollTimer = 0;
let lookPollTimer = 0;
let ledHeartbeatTimer = 0;
const paletteSampleCanvas = document.createElement("canvas");
const paletteSampleCtx = paletteSampleCanvas.getContext("2d", { willReadFrequently: true });
const supportedLooks = new Set(["screen", "vinyl", "sun", "moon"]);
const supportedModes = new Set(Object.keys(modeProfiles));
const modeAliases = {
  ambient: "living-breath",
  audio: "audio-orb",
  system: "lava-lamp",
  network: "lava-lamp",
  movie: "living-breath",
  gaming: "audio-orb",
  infrastructure: "lava-lamp",
  "screen-ambient": "lava-lamp"
};
let currentLook = window.localStorage.getItem("lookMode") || "screen";
let currentMode = window.localStorage.getItem("visualizerMode") || "living-breath";
let currentDisplaySourceId = window.localStorage.getItem("displaySourceId") || "";
let currentDisplayId = window.localStorage.getItem("displayId") || currentDisplaySourceId;
let currentDisplayMeta = null;
let currentWindowMode = window.localStorage.getItem("windowMode") || "fullscreen";
let themePalette = {
  primary: { red: 28, green: 92, blue: 86 },
  secondary: { red: 44, green: 86, blue: 118 },
  tertiary: { red: 118, green: 60, blue: 52 }
};
let ledMoodColor = { ...themePalette.primary };
let targetThemePalette = {
  primary: { ...themePalette.primary },
  secondary: { ...themePalette.secondary },
  tertiary: { ...themePalette.tertiary }
};

async function populateDisplaySelect() {
  const displays = await window.overlayAPI.listDisplays();
  if (!Array.isArray(displays) || displays.length === 0) {
    displaySelect.innerHTML = '<option value="">No displays found</option>';
    displaySelect.disabled = true;
    return;
  }

  displaySelect.disabled = false;
  displaySelect.innerHTML = "";

  const sortedDisplays = [...displays].sort((a, b) => {
    const ax = Number.isFinite(a.bounds?.x) ? a.bounds.x : 0;
    const bx = Number.isFinite(b.bounds?.x) ? b.bounds.x : 0;
    return ax - bx;
  });

  for (const [index, display] of sortedDisplays.entries()) {
    const option = document.createElement("option");
    option.value = display.displayId || display.id;
    option.dataset.sourceId = display.id;
    option.dataset.displayId = display.displayId || "";
    option.dataset.bounds = display.bounds ? JSON.stringify(display.bounds) : "";
    option.title = `${display.name} (${display.displayId || display.id})`;
    option.textContent = display.isPrimary
      ? `Monitor ${index + 1} (Primary)`
      : `Monitor ${index + 1}`;
    displaySelect.appendChild(option);
  }

  const preferred =
    sortedDisplays.find((display) => display.displayId === currentDisplayId) ??
    sortedDisplays.find((display) => display.id === currentDisplaySourceId) ??
    sortedDisplays.find((display) => display.isPrimary) ??
    sortedDisplays[0];

  currentDisplayId = preferred.displayId || preferred.id;
  currentDisplaySourceId = preferred.id;
  currentDisplayMeta = preferred;
  displaySelect.value = currentDisplayId;
  updateCaptureDebug();
  window.localStorage.setItem("displayId", currentDisplayId);
  window.localStorage.setItem("displaySourceId", currentDisplaySourceId);
  await window.overlayAPI.setDisplaySource(currentDisplaySourceId);
}

function getSelectedDisplayOption() {
  return displaySelect.selectedOptions.length > 0
    ? displaySelect.selectedOptions[0]
    : null;
}

async function getSelectedDisplayStream() {
  if (currentDisplaySourceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop"
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: currentDisplaySourceId,
            minFrameRate: 15,
            maxFrameRate: 30
          }
        }
      });
    } catch (error) {
      console.warn("Exact desktop source capture with audio failed; retrying exact video.", error);
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: currentDisplaySourceId,
            minFrameRate: 15,
            maxFrameRate: 30
          }
        }
      });

      try {
        const audioStream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            suppressLocalAudioPlayback: false
          },
          video: {
            frameRate: 1
          }
        });
        for (const track of audioStream.getVideoTracks()) {
          track.stop();
        }
        return new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioStream.getAudioTracks()
        ]);
      } catch (audioError) {
        console.warn("Desktop audio capture failed; continuing with exact monitor video only.", audioError);
        return videoStream;
      }
    } catch (videoError) {
      console.warn("Exact desktop source capture failed; falling back to display media handler.", videoError);
    }
  }

  return navigator.mediaDevices.getDisplayMedia({
    audio: {
      suppressLocalAudioPlayback: false
    },
    video: {
      frameRate: 15
    }
  });
}

async function applyWindowMode(mode) {
  currentWindowMode = mode === "windowed" ? "windowed" : "fullscreen";
  windowModeSelect.value = currentWindowMode;
  window.localStorage.setItem("windowMode", currentWindowMode);
  await window.overlayAPI.setWindowMode(currentWindowMode);
  if (currentWindowMode === "windowed") {
    await window.overlayAPI.moveWindowOffCapture();
  }
}

async function syncWindowModeSelect() {
  const actualMode = await window.overlayAPI.getWindowMode();
  currentWindowMode = actualMode === "windowed" ? "windowed" : currentWindowMode;
  windowModeSelect.value = currentWindowMode;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function averageRange(array, start, end) {
  let total = 0;
  let count = 0;

  for (let index = start; index < end; index += 1) {
    total += array[index];
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

function getCurrentModeProfile() {
  return modeProfiles[currentMode] || modeProfiles["living-breath"];
}

function normalizeMode(mode) {
  return supportedModes.has(mode) ? mode : modeAliases[mode] || "living-breath";
}

function getFirmwareMode(mode = currentMode) {
  return modeProfiles[normalizeMode(mode)]?.ledMode || "living_breath";
}

function colorToHex(color) {
  const toHex = (value) => clampColor(value).toString(16).padStart(2, "0");
  return `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
}

function updatePaletteDebug(palette = themePalette) {
  const entries = [
    [paletteSwatchPrimary, palette.primary],
    [paletteSwatchSecondary, palette.secondary],
    [paletteSwatchTertiary, palette.tertiary]
  ];

  const labels = entries.map(([swatch, color]) => {
    const hex = colorToHex(color);
    const saturation = Math.round(rgbToHsl(color).saturation * 100);
    swatch.style.background = hex;
    swatch.title = `${hex} saturation ${saturation}%`;
    return `${hex} S${saturation}%`;
  });

  paletteDebugText.textContent = labels.join(" / ");
}

function updateCaptureDebug() {
  const selectedOption = getSelectedDisplayOption();
  const label = selectedOption?.textContent || "Display";
  const bounds = currentDisplayMeta?.bounds;
  const boundsText = bounds
    ? `${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`
    : "bounds unavailable";
  const sourceText = currentDisplaySourceId ? currentDisplaySourceId.replace(/^screen:/, "src:") : "no source";
  captureDebugText.textContent = `${label} | ${boundsText} | ${sourceText}`;
}

function applyMode(mode) {
  const previousLedMode = esp32Bridge.ledMode;
  currentMode = normalizeMode(mode);
  esp32Bridge.ledMode = getFirmwareMode(currentMode);
  window.localStorage.setItem("visualizerMode", currentMode);
  window.localStorage.setItem("esp32LedMode", esp32Bridge.ledMode);
  body.dataset.mode = currentMode;

  for (const tab of modeTabs) {
    const isActive = tab.dataset.mode === currentMode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  if (analyser) {
    startLookPolling();
  } else {
    applyLookTheme();
  }

  if (previousLedMode !== esp32Bridge.ledMode) {
    sendLedCommand(`MODE:${esp32Bridge.ledMode}`);
  }
}

function colorToRgb(color, alpha = 1) {
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function getEsp32Palette() {
  return [
    themePalette.primary.red,
    themePalette.primary.green,
    themePalette.primary.blue,
    themePalette.secondary.red,
    themePalette.secondary.green,
    themePalette.secondary.blue,
    themePalette.tertiary.red,
    themePalette.tertiary.green,
    themePalette.tertiary.blue
  ];
}

function sendLedUdpPacket(loudness, bass, treble) {
  if (!esp32Bridge.enabled || !esp32Bridge.host || !window.overlayAPI.sendLedPacket) {
    return;
  }

  const now = performance.now();
  if (now - esp32Bridge.lastUdpSentAt < esp32Bridge.minSendIntervalMs) {
    return;
  }

  esp32Bridge.lastUdpSentAt = now;
  const smoothing = clamp(esp32Bridge.smoothing, 0.01, 1);
  esp32Bridge.smoothedLoudness += (loudness - esp32Bridge.smoothedLoudness) * smoothing;
  esp32Bridge.smoothedBass += (bass - esp32Bridge.smoothedBass) * smoothing;
  esp32Bridge.smoothedTreble += (treble - esp32Bridge.smoothedTreble) * smoothing;

  const activeFloor = 28;
  const volumeValue = clamp(
    Math.round(activeFloor + esp32Bridge.smoothedLoudness * (esp32Bridge.brightnessLimit - activeFloor)),
    activeFloor,
    100
  );
  const bassValue = clamp(Math.round(esp32Bridge.smoothedBass * 100), 0, 100);
  const trebleValue = clamp(Math.round(esp32Bridge.smoothedTreble * 100), 0, 100);
  const color = ledMoodColor || themePalette.primary;
  const red = clamp(Math.round(color.red), 0, 255);
  const green = clamp(Math.round(color.green), 0, 255);
  const blue = clamp(Math.round(color.blue), 0, 255);
  const packet = `LED:${red},${green},${blue},${volumeValue},${bassValue},${trebleValue}`;

  if (!esp32Bridge.udpStartedLogged) {
    esp32Bridge.udpStartedLogged = true;
    console.log(`LED UDP sending started: ${esp32Bridge.host}:${esp32Bridge.udpPort}`);
  }

  window.overlayAPI.sendLedPacket({
    host: esp32Bridge.host,
    port: esp32Bridge.udpPort,
    packet
  });
  esp32Bridge.udpPacketCount += 1;
  updateLedUdpStatus(volumeValue, bassValue, trebleValue);
}

function sendLedCommand(packet) {
  if (!esp32Bridge.host || !window.overlayAPI.sendLedPacket) {
    return;
  }

  window.overlayAPI.sendLedPacket({
    host: esp32Bridge.host,
    port: esp32Bridge.udpPort,
    packet
  });
  esp32Bridge.udpPacketCount += 1;
  updateLedUdpStatus();
}

function sendCurrentColorSolid() {
  const color = themePalette.primary;
  const red = clamp(Math.round(color.red), 0, 255);
  const green = clamp(Math.round(color.green), 0, 255);
  const blue = clamp(Math.round(color.blue), 0, 255);
  sendLedCommand(`LED:${red},${green},${blue},100,0,20`);
  sendLedCommand("TEST:solid");
}

function sendLedHeartbeat() {
  // The ESP32 firmware renders from LED:/level data; no heartbeat packet is needed.
}

function startLedHeartbeat() {
  if (ledHeartbeatTimer) {
    return;
  }

  sendLedHeartbeat();
  ledHeartbeatTimer = window.setInterval(sendLedHeartbeat, 1000);
}

function stopLedHeartbeat() {
  if (!ledHeartbeatTimer) {
    return;
  }

  window.clearInterval(ledHeartbeatTimer);
  ledHeartbeatTimer = 0;
}

function updateLedUdpStatus(volume = null, bass = null, treble = null) {
  // LED output intentionally mirrors the visualizer without visible app controls.
}

function queueEsp32Payload(payload) {
  esp32Bridge.pendingPayload = payload;

  if (esp32Bridge.sendTimer) {
    return;
  }

  pumpEsp32Bridge();
}

function scheduleEsp32Pump(delay = 0) {
  if (esp32Bridge.sendTimer) {
    return;
  }

  esp32Bridge.sendTimer = window.setTimeout(() => {
    esp32Bridge.sendTimer = 0;
    pumpEsp32Bridge();
  }, delay);
}

function pumpEsp32Bridge() {
  if (esp32Bridge.requestInFlight || !esp32Bridge.pendingPayload) {
    return;
  }

  const now = performance.now();
  const delay = esp32Bridge.minSendIntervalMs - (now - esp32Bridge.lastSentAt);
  if (delay > 0) {
    scheduleEsp32Pump(delay);
    return;
  }

  const payload = esp32Bridge.pendingPayload;
  esp32Bridge.pendingPayload = null;
  esp32Bridge.requestInFlight = true;
  esp32Bridge.lastLevel = payload.level;
  esp32Bridge.lastBass = payload.bass;
  esp32Bridge.lastMid = payload.mid;
  esp32Bridge.lastTreble = payload.treble;
  esp32Bridge.lastPaletteSignature = payload.paletteSignature;
  esp32Bridge.lastEvent = payload.event;
  esp32Bridge.lastSentAt = now;

  window.overlayAPI.sendLedLevel(
    esp32Bridge.host,
    payload.level,
    payload.bass,
    payload.mid,
    payload.treble,
    payload.palette,
    payload.event,
    payload.sequence,
    payload.sentAt
  ).then((ok) => {
    esp32Bridge.sentCount += 1;
    if (ok) {
      esp32Bridge.ackCount += 1;
    } else {
      esp32Bridge.failCount += 1;
    }
  }).catch((error) => {
    esp32Bridge.failCount += 1;
    console.error("Unable to send ESP32 LED level:", error);
  }).finally(() => {
    esp32Bridge.requestInFlight = false;
    if (esp32Bridge.pendingPayload) {
      scheduleEsp32Pump(0);
    }
  });
}

function detectAudioEvent(loudness, bass, treble) {
  const now = performance.now();
  const profile = getCurrentModeProfile();
  const eventGain = profile.eventGain;
  const previousBassAverage = esp32Bridge.bassAverage;
  const previousTrebleAverage = esp32Bridge.trebleAverage;
  const previousLoudnessAverage = esp32Bridge.loudnessAverage;

  esp32Bridge.bassAverage = previousBassAverage * 0.92 + bass * 0.08;
  esp32Bridge.trebleAverage = previousTrebleAverage * 0.9 + treble * 0.1;
  esp32Bridge.loudnessAverage = previousLoudnessAverage * 0.94 + loudness * 0.06;

  if (
    bass * eventGain > 0.18 &&
    bass > previousBassAverage * 1.55 + 0.08 / Math.max(0.35, eventGain) &&
    now - esp32Bridge.lastBeatAt > 220
  ) {
    esp32Bridge.lastBeatAt = now;
    return "beat";
  }

  if (
    treble * eventGain > 0.24 &&
    treble > previousTrebleAverage * 1.65 + 0.07 / Math.max(0.35, eventGain) &&
    now - esp32Bridge.lastTrebleHitAt > 180
  ) {
    esp32Bridge.lastTrebleHitAt = now;
    return "spark";
  }

  if (
    loudness * eventGain > 0.62 &&
    loudness > previousLoudnessAverage * 1.35 + 0.08 / Math.max(0.35, eventGain) &&
    now - esp32Bridge.lastPeakAt > 500
  ) {
    esp32Bridge.lastPeakAt = now;
    return "peak";
  }

  if (
    loudness < 0.045 &&
    now - esp32Bridge.lastQuietAt > 1200
  ) {
    esp32Bridge.lastQuietAt = now;
    return "quiet";
  }

  return "none";
}

function calculateLedLevel(loudness, bass, mid, treble) {
  const profile = getCurrentModeProfile();
  const noiseFloor = 0.025;
  const shapedLoudness = Math.max(0, loudness - noiseFloor) * profile.levelGain;
  const bandLift =
    bass * profile.bandLift.bass +
    mid * profile.bandLift.mid +
    treble * profile.bandLift.treble;
  const energy = clamp(shapedLoudness + bandLift, 0, 1);

  return Math.round(energy * esp32Bridge.ledCount);
}

function sendEsp32Level(level, bass = 0, mid = 0, treble = 0, event = "none", force = false) {
  if (!esp32Bridge.enabled || !esp32Bridge.host) {
    return;
  }

  const now = performance.now();
  const safeLevel = clamp(Math.round(level), 0, esp32Bridge.ledCount);
  const safeBass = clamp(Math.round(bass * 100), 0, 100);
  const safeMid = clamp(Math.round(mid * 100), 0, 100);
  const safeTreble = clamp(Math.round(treble * 100), 0, 100);
  const paletteSignature = getEsp32Palette().join(",");
  const paletteChanged = paletteSignature !== esp32Bridge.lastPaletteSignature;
  const eventChanged = event !== esp32Bridge.lastEvent;
  const pendingPayload = esp32Bridge.pendingPayload;

  esp32Bridge.currentLevel = safeLevel;
  esp32Bridge.currentBass = bass;
  esp32Bridge.currentMid = mid;
  esp32Bridge.currentTreble = treble;

  if (
    !force &&
    !paletteChanged &&
    !eventChanged &&
    (!pendingPayload ||
      (pendingPayload.level === safeLevel &&
        pendingPayload.bass === safeBass &&
        pendingPayload.mid === safeMid &&
        pendingPayload.treble === safeTreble &&
        pendingPayload.event === event &&
        pendingPayload.paletteSignature === paletteSignature)) &&
    safeLevel === esp32Bridge.lastLevel &&
    safeBass === esp32Bridge.lastBass &&
    safeMid === esp32Bridge.lastMid &&
    safeTreble === esp32Bridge.lastTreble &&
    now - esp32Bridge.lastSentAt < esp32Bridge.minSendIntervalMs * 4
  ) {
    return;
  }

  if (
    !force &&
    !paletteChanged &&
    !eventChanged &&
    now - esp32Bridge.lastSentAt < esp32Bridge.minSendIntervalMs
  ) {
    return;
  }

  queueEsp32Payload({
    sequence: esp32Bridge.nextSequence++,
    sentAt: Math.round(performance.now()),
    level: safeLevel,
    bass: safeBass,
    mid: safeMid,
    treble: safeTreble,
    palette: paletteSignature.split(",").map((value) => Number.parseInt(value, 10)),
    paletteSignature,
    event
  });
}

function formatLedLinkStatus(status) {
  if (!status) {
    if (esp32Bridge.failCount > 0 && esp32Bridge.ackCount === 0) {
      return `Offline ${esp32Bridge.host}`;
    }

    return `Ack ${esp32Bridge.ackCount} / Fail ${esp32Bridge.failCount}`;
  }

  const mode = status.mode || "linked";
  return `${mode} / ${status.packets || 0} pkt`;
}

function getStatusHost(status, fallbackHost = esp32Bridge.host) {
  return status?.ip || status?.host || fallbackHost || "";
}

function setEsp32UiState(state, detail = "") {
  esp32SetupPanel.classList.toggle("is-connected", state === "connected");
  esp32SetupPanel.classList.toggle("is-warning", state === "not-found" || state === "failed");

  if (state === "connected") {
    esp32StatusText.textContent = `ESP32: Connected at ${detail || esp32Bridge.host}`;
    esp32SetupText.textContent = "LED controller is online. Use Test LEDs to confirm the strip responds.";
    testLedBtn.disabled = false;
    saveIpBtn.disabled = false;
    return;
  }

  if (state === "searching") {
    esp32StatusText.textContent = "ESP32: Searching...";
    esp32SetupText.textContent = "Looking for esp32-led-visualizer.local and scanning this PC's local IPv4 subnet.";
    testLedBtn.disabled = true;
    saveIpBtn.disabled = true;
    return;
  }

  if (state === "failed") {
    esp32StatusText.textContent = "ESP32: Manual IP failed";
    esp32SetupText.textContent = "That IP did not respond as a Living Ambient Light ESP32. Check the IP, firmware, and Wi-Fi network.";
    testLedBtn.disabled = true;
    saveIpBtn.disabled = false;
    return;
  }

  esp32StatusText.textContent = "ESP32: Not found";
  esp32SetupText.textContent = "Make sure the ESP32 is powered on, flashed with the firmware, and connected to the same Wi-Fi network as this PC.";
  testLedBtn.disabled = true;
  saveIpBtn.disabled = false;
}

function useDiscoveredEsp32(status, save = true) {
  const host = getStatusHost(status);
  if (!host) {
    return false;
  }

  esp32Bridge.host = host;
  esp32Bridge.sentCount = 0;
  esp32Bridge.ackCount = 0;
  esp32Bridge.failCount = 0;
  esp32Bridge.lastStatus = status;
  esp32HostInput.value = host;
  if (save) {
    window.localStorage.setItem("esp32Host", host);
  }
  setEsp32UiState("connected", host);
  sendLedCommand(`MODE:${esp32Bridge.ledMode}`);
  return true;
}

async function checkEsp32Host(host, { save = true, manual = false } = {}) {
  const safeHost = String(host || "").trim();
  if (!safeHost) {
    if (manual) {
      setEsp32UiState("failed");
    }
    return null;
  }

  const status = await window.overlayAPI.getLedStatus(safeHost);
  if (status?.ok === true) {
    useDiscoveredEsp32(status, save);
    return status;
  }

  if (manual) {
    setEsp32UiState("failed");
  }
  return null;
}

async function discoverEsp32FromUi() {
  setEsp32UiState("searching");
  findLedBtn.disabled = true;
  retryDiscoveryBtn.disabled = true;

  const savedHost = window.localStorage.getItem("esp32Host") || "";
  if (savedHost) {
    const savedStatus = await checkEsp32Host(savedHost, { save: true });
    if (savedStatus) {
      findLedBtn.disabled = false;
      retryDiscoveryBtn.disabled = false;
      return savedStatus;
    }
  }

  const discovered = await window.overlayAPI.discoverLeds();
  if (discovered?.ok === true && useDiscoveredEsp32(discovered, true)) {
    findLedBtn.disabled = false;
    retryDiscoveryBtn.disabled = false;
    return discovered;
  }

  setEsp32UiState("not-found");
  findLedBtn.disabled = false;
  retryDiscoveryBtn.disabled = false;
  return null;
}

async function updateLedStatus() {
  if (!esp32Bridge.enabled || !esp32Bridge.host) {
    setEsp32UiState("not-found");
    return;
  }

  const status = await window.overlayAPI.getLedStatus(esp32Bridge.host);
  esp32Bridge.lastStatus = status;

  if (status?.ok === true) {
    useDiscoveredEsp32(status, true);
    console.log(formatLedLinkStatus(status));
  } else if (!esp32Bridge.lastStatus) {
    setEsp32UiState("not-found");
  }
}

function startLedStatusPolling() {
  stopLedStatusPolling();
  updateLedStatus();
  esp32Bridge.statusTimer = window.setInterval(updateLedStatus, 1000);
}

function stopLedStatusPolling() {
  if (esp32Bridge.statusTimer) {
    window.clearInterval(esp32Bridge.statusTimer);
    esp32Bridge.statusTimer = 0;
  }
}

function clampColor(value) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function mixColor(color, target, amount) {
  return {
    red: clampColor(color.red + (target.red - color.red) * amount),
    green: clampColor(color.green + (target.green - color.green) * amount),
    blue: clampColor(color.blue + (target.blue - color.blue) * amount)
  };
}

function interpolatePalette(currentPalette, nextPalette, amount) {
  return {
    primary: mixColor(currentPalette.primary, nextPalette.primary, amount),
    secondary: mixColor(currentPalette.secondary, nextPalette.secondary, amount),
    tertiary: mixColor(currentPalette.tertiary, nextPalette.tertiary, amount)
  };
}

function scaleColor(color, factor) {
  return {
    red: clampColor(color.red * factor),
    green: clampColor(color.green * factor),
    blue: clampColor(color.blue * factor)
  };
}

function tunePaletteColor(color, saturationBoost = 1.35, maxLightness = 0.58, minSaturation = 0.22) {
  const { hue, saturation, lightness } = rgbToHsl(color);
  return hslToRgb(
    hue,
    Math.min(1, Math.max(minSaturation, saturation * saturationBoost)),
    Math.min(maxLightness, Math.max(0.16, lightness))
  );
}

function createAmbientPalette(
  palette,
  factors = { primary: 0.42, secondary: 0.38, tertiary: 0.34 }
) {
  return {
    primary: scaleColor(palette.primary, factors.primary),
    secondary: scaleColor(palette.secondary, factors.secondary),
    tertiary: scaleColor(palette.tertiary, factors.tertiary)
  };
}

function luminanceOf(color) {
  return (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255;
}

function isNearNeutral(color) {
  const { saturation } = rgbToHsl(color);
  return saturation < 0.12;
}

function rgbToHsl(color) {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue;
  if (max === red) {
    hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
  } else if (max === green) {
    hue = ((blue - red) / delta + 2) / 6;
  } else {
    hue = ((red - green) / delta + 4) / 6;
  }

  return { hue: hue * 360, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;

  if (saturation === 0) {
    const value = clampColor(lightness * 255);
    return { red: value, green: value, blue: value };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const hueToChannel = (channelHue) => {
    let value = channelHue;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  return {
    red: clampColor(hueToChannel(normalizedHue + 1 / 3) * 255),
    green: clampColor(hueToChannel(normalizedHue) * 255),
    blue: clampColor(hueToChannel(normalizedHue - 1 / 3) * 255)
  };
}

function setThemePalette(palette) {
  targetThemePalette = palette;
}

function applyThemePalette(palette, forceSend = false) {
  themePalette = palette;
  updatePaletteDebug(themePalette);

  rootStyle.setProperty("--accent", colorToRgb(themePalette.primary, 1));
  rootStyle.setProperty("--accent-2", colorToRgb(themePalette.secondary, 1));
  rootStyle.setProperty("--accent-3", colorToRgb(themePalette.tertiary, 1));
}

function sampleScreenColor() {
  if (!captureVideo || !paletteSampleCtx || captureVideo.readyState < 2) {
    return null;
  }

  const sampleWidth = 80;
  const sampleHeight = 45;
  paletteSampleCanvas.width = sampleWidth;
  paletteSampleCanvas.height = sampleHeight;
  paletteSampleCtx.imageSmoothingEnabled = true;
  paletteSampleCtx.filter = "blur(1.4px)";
  paletteSampleCtx.drawImage(captureVideo, 0, 0, sampleWidth, sampleHeight);
  paletteSampleCtx.filter = "none";

  const { data } = paletteSampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  const buckets = new Map();
  let fallbackAverage = { red: 0, green: 0, blue: 0 };
  let totalWeight = 0;
  let neutralWeight = 0;
  let chromaWeight = 0;
  let saturationWeight = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const color = { red, green, blue };
    const { hue, saturation } = rgbToHsl(color);
    const luminance = luminanceOf(color);
    const tooDark = luminance < 0.035;
    const tooBright = luminance > 0.985;
    let bucketName;

    if (tooDark) {
      bucketName = "shadow";
    } else if (saturation < 0.13 || tooBright) {
      bucketName = luminance > 0.62 ? "light-neutral" : "neutral";
    } else if (hue < 22 || hue >= 338) {
      bucketName = "red";
    } else if (hue < 52) {
      bucketName = "orange";
    } else if (hue < 76) {
      bucketName = "yellow";
    } else if (hue < 158) {
      bucketName = "green";
    } else if (hue < 210) {
      bucketName = "cyan";
    } else if (hue < 260) {
      bucketName = "blue";
    } else if (hue < 318) {
      bucketName = "purple";
    } else {
      bucketName = "magenta";
    }

    const brightNeutral = luminance > 0.84 && saturation < 0.35;
    const colorWeight = Math.max(0.05, saturation) * (1 - Math.max(0, luminance - 0.88) * 2.4);
    const weight = tooDark ? 0.18 : brightNeutral ? 0.28 : 0.55 + colorWeight * 1.65;
    const bucket = buckets.get(bucketName) || {
      name: bucketName,
      red: 0,
      green: 0,
      blue: 0,
      weight: 0,
      saturation: 0,
      luminance: 0
    };

    fallbackAverage.red += red;
    fallbackAverage.green += green;
    fallbackAverage.blue += blue;
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    bucket.saturation += saturation * weight;
    bucket.luminance += luminance * weight;
    bucket.weight += weight;
    buckets.set(bucketName, bucket);
    totalWeight += weight;
    saturationWeight += saturation * weight;
    if (bucketName.includes("neutral")) {
      neutralWeight += weight;
    } else if (bucketName !== "shadow") {
      chromaWeight += weight;
    }
  }

  const pixelCount = data.length / 4;
  fallbackAverage = {
    red: fallbackAverage.red / pixelCount,
    green: fallbackAverage.green / pixelCount,
    blue: fallbackAverage.blue / pixelCount
  };

  const bucketList = Array.from(buckets.values()).map((bucket) => ({
    name: bucket.name,
    red: bucket.red / Math.max(1, bucket.weight),
    green: bucket.green / Math.max(1, bucket.weight),
    blue: bucket.blue / Math.max(1, bucket.weight),
    saturation: bucket.saturation / Math.max(1, bucket.weight),
    luminance: bucket.luminance / Math.max(1, bucket.weight),
    weight: bucket.weight,
    share: bucket.weight / Math.max(1, totalWeight)
  }));
  const sortedBuckets = bucketList
    .filter((bucket) => bucket.name !== "shadow")
    .sort((a, b) => {
      const scoreBucket = (bucket) => {
        const highlightPenalty = bucket.luminance > 0.84 && bucket.saturation < 0.42 ? 0.35 : 1;
        const greenPenalty = bucket.name === "green" ? 0.92 : 1;
        return bucket.share * (0.3 + bucket.saturation * 1.7) * highlightPenalty * greenPenalty;
      };
      return scoreBucket(b) - scoreBucket(a);
    });
  const colorBuckets = sortedBuckets.filter(
    (bucket) =>
      !bucket.name.includes("neutral") &&
      bucket.saturation >= 0.16 &&
      !(bucket.luminance > 0.9 && bucket.saturation < 0.42)
  );
  const neutralBucket =
    bucketList.find((bucket) => bucket.name === "light-neutral") ??
    bucketList.find((bucket) => bucket.name === "neutral");
  const shadowBucket = bucketList.find((bucket) => bucket.name === "shadow");
  const averageSaturation = totalWeight > 0 ? saturationWeight / totalWeight : rgbToHsl(fallbackAverage).saturation;

  return {
    average: fallbackAverage,
    buckets: sortedBuckets,
    colorBuckets,
    neutral: neutralBucket || fallbackAverage,
    shadow: shadowBucket || fallbackAverage,
    monochrome:
      averageSaturation < 0.09 ||
      (neutralWeight / Math.max(1, totalWeight) > 0.82 && chromaWeight / Math.max(1, totalWeight) < 0.12)
  };
}

function createScreenPalette(frameColors) {
  if (!frameColors) {
    return null;
  }

  if (frameColors.monochrome) {
    return {
      primary: { red: 38, green: 50, blue: 112 },
      secondary: { red: 78, green: 46, blue: 136 },
      tertiary: { red: 20, green: 26, blue: 70 }
    };
  }

  const colorBuckets = frameColors.colorBuckets?.length ? frameColors.colorBuckets : frameColors.buckets;
  const dominantBucket = colorBuckets[0] || frameColors.buckets[0] || frameColors.average;
  const secondaryBucket =
    colorBuckets.find((bucket) => bucket.name !== dominantBucket.name) ||
    frameColors.buckets.find((bucket) => bucket.name !== dominantBucket.name && !bucket.name.includes("neutral")) ||
    dominantBucket ||
    frameColors.average;
  const tertiaryBucket =
    colorBuckets.find((bucket) => bucket.name !== dominantBucket.name && bucket.name !== secondaryBucket.name) ||
    secondaryBucket ||
    dominantBucket;
  const shadowSource = frameColors.shadow || frameColors.average;

  const dominantSource = mixColor(frameColors.average, dominantBucket, 0.88);
  const secondarySource = mixColor(dominantBucket, secondaryBucket, 0.72);
  const tertiarySource = mixColor(tertiaryBucket, shadowSource, 0.28);
  const dominant = tunePaletteColor(dominantSource, 1.65, 0.52, 0.34);
  const secondary = tunePaletteColor(secondarySource, 1.5, 0.48, 0.3);
  const tertiary = tunePaletteColor(tertiarySource, 1.35, 0.36, 0.24);

  return {
    primary: scaleColor(dominant, 0.72),
    secondary: scaleColor(secondary, 0.66),
    tertiary: scaleColor(tertiary, 0.7)
  };
}

function createLedMoodColor(frameColors) {
  if (!frameColors) {
    return ledMoodColor;
  }

  const source =
    frameColors.colorBuckets?.[0] ??
    frameColors.buckets?.[0] ??
    frameColors.neutral ??
    frameColors.average;
  const literalAverage = frameColors.average || source;
  const mixed = mixColor(literalAverage, source, frameColors.monochrome ? 0.12 : 0.32);
  const { saturation, lightness } = rgbToHsl(mixed);
  const saturationBoost = saturation < 0.18 ? 1.08 : 1.0;
  const lightnessTarget = clamp(lightness, 0.14, 0.54);

  return tunePaletteColor(mixed, saturationBoost, lightnessTarget, 0.08);
}

function applyLookClass() {
  body.classList.remove(
    "look-screen",
    "look-vinyl",
    "look-sun",
    "look-moon"
  );
  body.classList.add(`look-${currentLook}`);
}

async function applyLookTheme() {
  applyLookClass();

  if (currentLook === "screen") {
    const frameColors = sampleScreenColor();
    const screenPalette = createScreenPalette(frameColors);
    ledMoodColor = createLedMoodColor(frameColors);
    if (screenPalette) {
      setThemePalette(screenPalette);
    }
    return;
  }

  if (currentLook === "vinyl") {
    ledMoodColor = { red: 180, green: 180, blue: 180 };
    setThemePalette(createAmbientPalette({
      primary: { red: 214, green: 214, blue: 214 },
      secondary: { red: 148, green: 148, blue: 148 },
      tertiary: { red: 82, green: 82, blue: 82 }
    }));
    return;
  }

  if (currentLook === "sun") {
    ledMoodColor = { red: 88, green: 168, blue: 74 };
    setThemePalette(createAmbientPalette({
      primary: { red: 88, green: 168, blue: 74 },
      secondary: { red: 132, green: 205, blue: 111 },
      tertiary: { red: 34, green: 102, blue: 30 }
    }));
    return;
  }

  if (currentLook === "moon") {
    ledMoodColor = { red: 101, green: 163, blue: 243 };
    setThemePalette(createAmbientPalette({
      primary: { red: 101, green: 163, blue: 243 },
      secondary: { red: 179, green: 216, blue: 255 },
      tertiary: { red: 32, green: 82, blue: 160 }
    }));
    return;
  }

  ledMoodColor = { red: 180, green: 180, blue: 180 };
  setThemePalette(createAmbientPalette({
    primary: { red: 226, green: 226, blue: 226 },
    secondary: { red: 138, green: 138, blue: 138 },
    tertiary: { red: 54, green: 54, blue: 54 }
  }));
}

function drawLivingBreath(width, height, loudness, bass, treble) {
  const now = performance.now();
  const minSize = Math.min(width, height);
  const breath = 0.5 + 0.5 * Math.sin(now / 1900);
  const easedBreath = breath * breath * (3 - 2 * breath);
  const pulse = easedBreath * 0.12 + bass * 0.14 + loudness * 0.08;
  const shimmer = treble * 0.035;
  const wash = ctx.createLinearGradient(width * 0.22, height * 0.16, width * 0.78, height * 0.86);

  wash.addColorStop(0, colorToRgb(themePalette.tertiary, 0.08));
  wash.addColorStop(0.44, colorToRgb(themePalette.primary, 0.14 + pulse * 0.16));
  wash.addColorStop(0.72, colorToRgb(themePalette.secondary, 0.1 + shimmer));
  wash.addColorStop(1, colorToRgb(themePalette.tertiary, 0.04));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const fields = [
    { color: themePalette.primary, x: 0.42, y: 0.6, radius: 0.46, alpha: 0.24 + pulse * 0.18 },
    { color: themePalette.secondary, x: 0.64, y: 0.42, radius: 0.42, alpha: 0.16 + shimmer },
    { color: themePalette.tertiary, x: 0.32, y: 0.38, radius: 0.5, alpha: 0.12 + bass * 0.05 }
  ];

  for (const field of fields) {
    const x = width * field.x + Math.sin(now / 4800 + field.x * 6) * minSize * 0.025;
    const y = height * field.y + Math.cos(now / 5400 + field.y * 6) * minSize * 0.025;
    const radius = minSize * field.radius;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colorToRgb(field.color, field.alpha));
    gradient.addColorStop(0.55, colorToRgb(field.color, field.alpha * 0.34));
    gradient.addColorStop(1, colorToRgb(field.color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawLavaLamp(width, height, loudness, bass, treble) {
  const now = performance.now() * 1.1;
  const wash = ctx.createLinearGradient(0, 0, width, height);
  const minSize = Math.min(width, height);
  const blobs = [
    { color: themePalette.primary, x: 0.28, y: 0.74, rx: 0.2, ry: 0.34, sx: 7200, sy: 10800, phase: 0.2 },
    { color: themePalette.secondary, x: 0.48, y: 0.38, rx: 0.24, ry: 0.4, sx: 8900, sy: 9200, phase: 1.7 },
    { color: themePalette.tertiary, x: 0.66, y: 0.68, rx: 0.22, ry: 0.36, sx: 7800, sy: 11600, phase: 3.2 },
    { color: themePalette.primary, x: 0.78, y: 0.28, rx: 0.16, ry: 0.26, sx: 9700, sy: 8400, phase: 4.5 },
    { color: themePalette.secondary, x: 0.2, y: 0.28, rx: 0.15, ry: 0.3, sx: 8400, sy: 12200, phase: 5.4 },
    { color: themePalette.tertiary, x: 0.38, y: 0.58, rx: 0.19, ry: 0.31, sx: 9300, sy: 9800, phase: 2.6 },
    { color: themePalette.primary, x: 0.86, y: 0.58, rx: 0.14, ry: 0.24, sx: 7600, sy: 10500, phase: 6.1 }
  ];
  const droplets = [
    { color: themePalette.secondary, x: 0.14, y: 0.5, r: 0.07, sx: 3600, sy: 5200, phase: 0.4 },
    { color: themePalette.primary, x: 0.34, y: 0.22, r: 0.055, sx: 4100, sy: 4700, phase: 1.2 },
    { color: themePalette.tertiary, x: 0.54, y: 0.18, r: 0.065, sx: 3900, sy: 5600, phase: 2.1 },
    { color: themePalette.secondary, x: 0.72, y: 0.46, r: 0.075, sx: 4400, sy: 5000, phase: 2.9 },
    { color: themePalette.primary, x: 0.9, y: 0.78, r: 0.06, sx: 3700, sy: 6200, phase: 3.7 },
    { color: themePalette.tertiary, x: 0.44, y: 0.86, r: 0.05, sx: 4300, sy: 5100, phase: 4.6 },
    { color: themePalette.secondary, x: 0.18, y: 0.84, r: 0.058, sx: 3500, sy: 5900, phase: 5.5 },
    { color: themePalette.primary, x: 0.62, y: 0.82, r: 0.07, sx: 4800, sy: 5300, phase: 6.3 }
  ];

  wash.addColorStop(0, colorToRgb(themePalette.tertiary, 0.32));
  wash.addColorStop(0.5, colorToRgb(themePalette.primary, 0.22));
  wash.addColorStop(1, colorToRgb(themePalette.secondary, 0.3));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.filter = "blur(18px)";
  ctx.globalCompositeOperation = "screen";
  for (const blob of blobs) {
    const x = width * blob.x + Math.sin(now / blob.sx + blob.phase) * width * 0.08;
    const y = height * blob.y + Math.cos(now / blob.sy + blob.phase) * height * 0.24;
    const radiusX = minSize * (blob.rx + bass * 0.025 + loudness * 0.018);
    const radiusY = minSize * (blob.ry + bass * 0.04 + loudness * 0.025);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));

    gradient.addColorStop(0, colorToRgb(blob.color, 0.92 + loudness * 0.08));
    gradient.addColorStop(0.34, colorToRgb(blob.color, 0.62 + bass * 0.12));
    gradient.addColorStop(0.66, colorToRgb(blob.color, 0.22));
    gradient.addColorStop(1, colorToRgb(blob.color, 0));
    ctx.fillStyle = gradient;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(radiusX, radiusY), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.filter = "blur(8px)";
  ctx.globalCompositeOperation = "lighter";
  for (const blob of blobs.slice(0, 5)) {
    const x = width * blob.x + Math.sin(now / blob.sx + blob.phase) * width * 0.08;
    const y = height * blob.y + Math.cos(now / blob.sy + blob.phase) * height * 0.24;
    const radius = minSize * (blob.rx * 0.48 + bass * 0.018);
    const core = ctx.createRadialGradient(x, y, 0, x, y, radius);

    core.addColorStop(0, colorToRgb(blob.color, 0.52));
    core.addColorStop(0.62, colorToRgb(blob.color, 0.18));
    core.addColorStop(1, colorToRgb(blob.color, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const droplet of droplets) {
    const x = width * droplet.x + Math.sin(now / droplet.sx + droplet.phase) * width * 0.07;
    const y = height * droplet.y + Math.cos(now / droplet.sy + droplet.phase) * height * 0.18;
    const radius = minSize * (droplet.r + loudness * 0.01);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, colorToRgb(droplet.color, 0.5 + bass * 0.08));
    gradient.addColorStop(0.6, colorToRgb(droplet.color, 0.2));
    gradient.addColorStop(1, colorToRgb(droplet.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = `rgba(2, 5, 10, ${0.12 - treble * 0.03})`;
  ctx.fillRect(0, 0, width, height);
}

function drawAudioOrb(width, height, loudness, bass, treble) {
  const now = performance.now();
  const centerX = width * 0.5;
  const centerY = height * 0.52;
  const ringCount = 4;
  const baseRadius = Math.min(width, height) * (0.15 + loudness * 0.08);

  for (let index = ringCount; index >= 1; index -= 1) {
    const radius = baseRadius * (index * 0.72 + 0.52 + bass * 0.42);
    const alpha = 0.11 + (ringCount - index) * 0.035 + loudness * 0.16;
    const wobble = Math.sin(now / 300 + index) * treble * 8;

    ctx.strokeStyle = colorToRgb(index % 2 === 0 ? themePalette.secondary : themePalette.primary, alpha);
    ctx.lineWidth = Math.max(2, radius * 0.035);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius + wobble, radius * (0.82 + bass * 0.18), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * (2.6 + bass));
  core.addColorStop(0, colorToRgb(themePalette.primary, 0.96));
  core.addColorStop(0.28, colorToRgb(themePalette.secondary, 0.5 + loudness * 0.24));
  core.addColorStop(0.66, colorToRgb(themePalette.tertiary, 0.22 + treble * 0.18));
  core.addColorStop(1, colorToRgb(themePalette.tertiary, 0));

  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * (2.7 + bass), 0, Math.PI * 2);
  ctx.fill();

  for (let index = 0; index < 18; index += 1) {
    const angle = (Math.PI * 2 * index) / 18 + now / 1800;
    const distance = baseRadius * (2.25 + Math.sin(now / 420 + index) * 0.18 + treble * 0.9);
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    const size = 1.5 + treble * 7;

    ctx.fillStyle = colorToRgb(themePalette.secondary, 0.08 + treble * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDiagnosticMeter(width, height, frequencyData, barCount, barWidth) {
  const gradient = ctx.createLinearGradient(0, height * 0.25, width, height);
  gradient.addColorStop(0, colorToRgb(themePalette.primary, 0.8));
  gradient.addColorStop(0.58, colorToRgb(themePalette.secondary, 0.74));
  gradient.addColorStop(1, colorToRgb(themePalette.tertiary, 0.7));

  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  for (let line = 1; line < 5; line += 1) {
    const y = height - (height * 0.14 * line);
    ctx.fillRect(0, y, width, 1);
  }

  for (let index = 0; index < barCount; index += 1) {
    const value = frequencyData[index] / 255;
    const eased = value * value;
    const barHeight = Math.max(3, eased * height * 0.62);
    const x = index * barWidth;
    const y = height - barHeight;
    const radius = Math.min(14, barWidth * 0.35);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + 2, y, Math.max(4, barWidth - 4), barHeight, radius);
    ctx.fill();
  }
}

function drawCalibration(width, height) {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const size = Math.min(width, height) * 0.26;
  const colors = [
    { red: 255, green: 0, blue: 0 },
    { red: 0, green: 255, blue: 0 },
    { red: 0, green: 0, blue: 255 },
    { red: 255, green: 255, blue: 255 },
    themePalette.primary,
    themePalette.secondary
  ];

  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * ring * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  colors.forEach((color, index) => {
    const angle = (Math.PI * 2 * index) / colors.length - Math.PI / 2;
    const x = centerX + Math.cos(angle) * size * 0.92;
    const y = centerY + Math.sin(angle) * size * 0.92;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 0.28);

    gradient.addColorStop(0, colorToRgb(color, 0.88));
    gradient.addColorStop(1, colorToRgb(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = colorToRgb(themePalette.primary, 0.34);
  ctx.fillRect(centerX - size * 0.7, centerY + size * 1.25, size * 0.46, 16);
  ctx.fillStyle = colorToRgb(themePalette.secondary, 0.34);
  ctx.fillRect(centerX - size * 0.14, centerY + size * 1.25, size * 0.46, 16);
  ctx.fillStyle = colorToRgb(themePalette.tertiary, 0.34);
  ctx.fillRect(centerX + size * 0.42, centerY + size * 1.25, size * 0.46, 16);
}

function draw() {
  if (!analyser) {
    return;
  }

  const profile = getCurrentModeProfile();
  const smoothedPalette = interpolatePalette(themePalette, targetThemePalette, profile.smoothing);
  applyThemePalette(smoothedPalette);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  analyser.getByteFrequencyData(frequencyData);

  const barCount = Math.min(96, frequencyData.length);
  const barWidth = width / barCount;
  const loudness = averageRange(frequencyData, 0, barCount) / 255;
  const bass = averageRange(frequencyData, 0, Math.floor(barCount * 0.15)) / 255;
  const mid = averageRange(
    frequencyData,
    Math.floor(barCount * 0.15),
    Math.floor(barCount * 0.55)
  ) / 255;
  const treble = averageRange(
    frequencyData,
    Math.floor(barCount * 0.55),
    barCount
  ) / 255;
  detectAudioEvent(loudness, bass, treble);

  sendLedUdpPacket(loudness, bass, treble);
  sendLedHeartbeat();

  ctx.clearRect(0, 0, width, height);

  if (currentMode === "diagnostic-meter") {
    drawDiagnosticMeter(width, height, frequencyData, barCount, barWidth);
  } else if (currentMode === "lava-lamp") {
    drawLavaLamp(width, height, loudness, bass, treble);
  } else if (currentMode === "audio-orb") {
    drawAudioOrb(width, height, loudness, bass, treble);
  } else if (currentMode === "calibration") {
    drawCalibration(width, height);
  } else {
    drawLivingBreath(width, height, loudness, bass, treble);
  }

  if (currentLook === "vinyl") {
    glowRing.style.opacity = "0.78";
  } else {
    const ambientBreath = 0.5 + 0.5 * Math.sin(performance.now() / 1850);
    const modeScale =
      currentMode === "audio-orb" ? 1.08 :
      currentMode === "lava-lamp" ? 1.28 :
      currentMode === "diagnostic-meter" ? 0.64 :
      currentMode === "calibration" ? 0.78 :
      0.9;
    const ringScale = modeScale + ambientBreath * 0.11 + loudness * 0.22 * profile.ringGain + bass * 0.08 * profile.ringGain;
    glowRing.style.transform = `translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
    glowRing.style.opacity = String(
      clamp(
        currentMode === "diagnostic-meter"
          ? 0.1
          : 0.34 + ambientBreath * 0.18 + loudness * 0.42 * profile.ringGain,
        currentMode === "diagnostic-meter" ? 0.08 : 0.22,
        1
      )
    );
  }

  volumeValue.textContent = `${Math.round(loudness * 100)}%`;
  bassValue.textContent = `${Math.round(bass * 100)}%`;
  trebleValue.textContent = `${Math.round(treble * 100)}%`;

  animationFrame = window.requestAnimationFrame(draw);
}

async function updateSystemVolume() {
  const systemVolume = await window.overlayAPI.getSystemVolume();
  if (typeof systemVolume === "number") {
    volumeValue.textContent = `${systemVolume}%`;
  }
}

function startVolumePolling() {
  stopVolumePolling();
  updateSystemVolume();
  volumePollTimer = window.setInterval(updateSystemVolume, 10000);
}

function stopVolumePolling() {
  if (volumePollTimer) {
    window.clearInterval(volumePollTimer);
    volumePollTimer = 0;
  }
}

function startLookPolling() {
  stopLookPolling();
  applyLookTheme();
  if (currentLook === "screen") {
    lookPollTimer = window.setInterval(applyLookTheme, getCurrentModeProfile().paletteIntervalMs);
  }
}

function stopLookPolling() {
  if (lookPollTimer) {
    window.clearInterval(lookPollTimer);
    lookPollTimer = 0;
  }
}

async function startVisualizer() {
  await stopVisualizer();
  esp32Bridge.ledMode = getFirmwareMode(currentMode);
  window.localStorage.setItem("esp32LedMode", esp32Bridge.ledMode);
  sendLedCommand(`MODE:${esp32Bridge.ledMode}`);

  try {
    await populateDisplaySelect();
    mediaStream = await getSelectedDisplayStream();

    captureVideo = document.createElement("video");
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.srcObject = mediaStream;
    await captureVideo.play();
    captureBackdrop.srcObject = mediaStream;
    await captureBackdrop.play();
    capturePreview.srcObject = mediaStream;
    await capturePreview.play();
    updateCaptureDebug();

    if (mediaStream.getAudioTracks().length > 0) {
      audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.84;
      sourceNode.connect(analyser);

      frequencyData = new Uint8Array(analyser.frequencyBinCount);
    } else {
      console.warn("Selected display stream has no audio track; screen reflection will continue without spectrum audio.");
      analyser = null;
      frequencyData = null;
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    startVolumePolling();
    startLookPolling();
    startLedHeartbeat();
    if (analyser) {
      draw();
    }
  } catch (error) {
    console.error(error);
  }
}

async function stopVisualizer() {
  stopVolumePolling();
  stopLookPolling();
  stopLedStatusPolling();
  stopLedHeartbeat();

  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }

  if (captureVideo) {
    captureVideo.pause();
    captureVideo.srcObject = null;
    captureVideo = null;
  }

  captureBackdrop.pause();
  captureBackdrop.srcObject = null;
  capturePreview.pause();
  capturePreview.srcObject = null;

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  analyser = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  volumeValue.textContent = "0%";
  bassValue.textContent = "0%";
  trebleValue.textContent = "0%";
  glowRing.style.transform =
    currentLook === "vinyl"
      ? "translate(-50%, -50%) scale(0.93)"
      : "translate(-50%, -50%) scale(0.92)";
  glowRing.style.opacity = "0.45";
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

startBtn.addEventListener("click", () => {
  esp32Bridge.ledMode = getFirmwareMode(currentMode);
  window.localStorage.setItem("esp32LedMode", esp32Bridge.ledMode);
  sendLedCommand(`MODE:${esp32Bridge.ledMode}`);
  startVisualizer();
});

stopBtn.addEventListener("click", () => {
  stopVisualizer();
});

exitBtn.addEventListener("click", () => {
  window.overlayAPI.exitApp();
});

displaySelect.addEventListener("change", async () => {
  const selectedOption = getSelectedDisplayOption();
  currentDisplayId = selectedOption?.dataset.displayId || displaySelect.value;
  currentDisplaySourceId = selectedOption?.dataset.sourceId || displaySelect.value;
  currentDisplayMeta = {
    id: currentDisplaySourceId,
    displayId: currentDisplayId,
    name: selectedOption?.title || selectedOption?.textContent || "Display",
    bounds: selectedOption?.dataset.bounds ? JSON.parse(selectedOption.dataset.bounds) : null
  };
  updateCaptureDebug();
  window.localStorage.setItem("displayId", currentDisplayId);
  window.localStorage.setItem("displaySourceId", currentDisplaySourceId);
  await window.overlayAPI.setDisplaySource(currentDisplaySourceId);
  if (currentWindowMode === "windowed") {
    await window.overlayAPI.moveWindowOffCapture();
  }
  if (analyser) {
    startVisualizer();
  }
});

async function applyEsp32Host() {
  const nextHost = esp32HostInput.value.trim();
  if (!nextHost || nextHost === esp32Bridge.host) {
    return;
  }

  esp32Bridge.host = nextHost;
  esp32Bridge.sentCount = 0;
  esp32Bridge.ackCount = 0;
  esp32Bridge.failCount = 0;
  esp32Bridge.lastStatus = null;
  setEsp32UiState("searching");
  await checkEsp32Host(esp32Bridge.host, { save: true, manual: true });
}

function applyLedSettings() {
  const nextHost = esp32HostInput.value.trim();
  const nextPort = esp32Bridge.udpPort;
  const nextBrightness = esp32Bridge.brightnessLimit;

  if (nextHost && nextHost !== esp32Bridge.host) {
    esp32Bridge.host = nextHost;
    esp32Bridge.sentCount = 0;
    esp32Bridge.ackCount = 0;
    esp32Bridge.failCount = 0;
    esp32Bridge.lastStatus = null;
    window.localStorage.setItem("esp32Host", esp32Bridge.host);
  }

  esp32Bridge.udpPort = nextPort;
  esp32Bridge.brightnessLimit = nextBrightness;
  window.localStorage.setItem("esp32UdpPort", String(esp32Bridge.udpPort));
  window.localStorage.setItem("esp32BrightnessLimit", String(esp32Bridge.brightnessLimit));
  window.localStorage.setItem("esp32LedSmoothing", String(esp32Bridge.smoothing));
  window.localStorage.setItem("esp32LedMode", esp32Bridge.ledMode);
}

esp32HostInput.addEventListener("change", applyEsp32Host);
esp32HostInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyEsp32Host();
    esp32HostInput.blur();
  }
});

findLedBtn.addEventListener("click", () => {
  discoverEsp32FromUi();
});

retryDiscoveryBtn.addEventListener("click", () => {
  discoverEsp32FromUi();
});

testLedBtn.addEventListener("click", async () => {
  const host = esp32HostInput.value.trim() || esp32Bridge.host;
  if (!host) {
    setEsp32UiState("not-found");
    return;
  }

  testLedBtn.disabled = true;
  esp32StatusText.textContent = `ESP32: Testing ${host}...`;
  const ok = await window.overlayAPI.testLeds(host);
  testLedBtn.disabled = false;

  if (ok) {
    const status = await checkEsp32Host(host, { save: true });
    if (!status) {
      esp32Bridge.host = host;
      esp32HostInput.value = host;
      window.localStorage.setItem("esp32Host", host);
      setEsp32UiState("connected", host);
    }
    return;
  }

  setEsp32UiState("failed");
});

saveIpBtn.addEventListener("click", async () => {
  const host = esp32HostInput.value.trim();
  if (!host) {
    setEsp32UiState("not-found");
    return;
  }

  await checkEsp32Host(host, { save: true, manual: true });
});

forgetIpBtn.addEventListener("click", () => {
  window.localStorage.removeItem("esp32Host");
  esp32Bridge.host = "";
  esp32Bridge.lastStatus = null;
  esp32HostInput.value = "";
  setEsp32UiState("not-found");
});

manualIpBtn.addEventListener("click", () => {
  esp32HostInput.focus();
  esp32HostInput.select();
});

windowModeSelect.addEventListener("change", () => {
  applyWindowMode(windowModeSelect.value);
});

lookSelect.addEventListener("change", () => {
  currentLook = lookSelect.value;
  window.localStorage.setItem("lookMode", currentLook);
  applyLookTheme();
  if (analyser) {
    startLookPolling();
  }
});

for (const tab of modeTabs) {
  tab.addEventListener("click", () => {
    applyMode(tab.dataset.mode);
  });
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => {
  stopVisualizer();
});

if (!supportedLooks.has(currentLook)) {
  currentLook = "screen";
  window.localStorage.setItem("lookMode", currentLook);
}

if (!supportedModes.has(currentMode)) {
  currentMode = normalizeMode(currentMode);
  window.localStorage.setItem("visualizerMode", currentMode);
}

resizeCanvas();
applyMode(currentMode);
applyThemePalette(themePalette, true);
lookSelect.value = currentLook;
windowModeSelect.value = currentWindowMode;
esp32HostInput.value = esp32Bridge.host;
setEsp32UiState(esp32Bridge.host ? "searching" : "not-found");
console.log(`LED UDP target: ${esp32Bridge.host || "not set"}:${esp32Bridge.udpPort}`);
updateLedUdpStatus();
syncWindowModeSelect().then(() => applyWindowMode(currentWindowMode));
populateDisplaySelect().then(() => {
  applyLookTheme();
  startVisualizer();
});
discoverEsp32FromUi();
