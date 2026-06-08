#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <Adafruit_NeoPixel.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
#define FALLBACK_AP_NAME "AudioVisualizer-ESP32"
#define FALLBACK_AP_PASS "CHANGE_ME_SETUP_PASSWORD"
#define DEVICE_HOSTNAME "esp32-led-visualizer"

#define LED_PIN 2
#define LED_COUNT 60
#define UDP_PORT 4210
#define UDP_BUFFER_SIZE 256

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
WebServer server(80);
WiFiUDP ledUdp;

const unsigned long FRAME_INTERVAL_MS = 16;
unsigned long lastFrameAt = 0;
unsigned long lastStatsAt = 0;
unsigned long lastPacketAt = 0;
unsigned long lastSentAt = 0;
unsigned long testModeUntil = 0;
unsigned long packetCount = 0;
unsigned long drawCount = 0;
unsigned long droppedFrames = 0;
unsigned long lastSequence = 0;
unsigned long lastPacketGapMs = 0;
unsigned long maxPacketGapMs = 0;
unsigned long packetsAtLastStats = 0;
unsigned long drawsAtLastStats = 0;
int packetFps = 0;
int drawFps = 0;
bool wifiStationConnected = false;

int targetLevel = 0;
float displayedLevel = 0.0f;

int bassPercent = 0;
int midPercent = 0;
int treblePercent = 0;

float beatPulse = 0.0f;
float sparklePulse = 0.0f;
float peakPulse = 0.0f;
float quietPulse = 0.0f;
bool hasReceivedFrame = false;

enum RenderMode {
  MODE_LIVING_BREATH,
  MODE_ACCURATE_AMBIENT,
  MODE_AUDIO_ORB,
  MODE_DIAGNOSTIC_METER,
  MODE_SOLID_TEST
};

RenderMode renderMode = MODE_LIVING_BREATH;
float smoothedLoudness = 0.0f;
float smoothedBass = 0.0f;
float smoothedMid = 0.0f;
float smoothedTreble = 0.0f;
float smoothedAmbient = 0.0f;
float breathPhase = 0.0f;
unsigned long lastLivingStepAt = 0;

uint8_t currentPalette[3][3] = {
  {38, 50, 112},
  {78, 46, 136},
  {20, 26, 70}
};

uint8_t targetPalette[3][3] = {
  {38, 50, 112},
  {78, 46, 136},
  {20, 26, 70}
};

uint8_t clampByte(int value) {
  return constrain(value, 0, 255);
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

uint8_t mixByte(uint8_t a, uint8_t b, float amount) {
  return clampByte((int)(a + (b - a) * amount));
}

uint8_t gammaCorrect(float value) {
  float normalized = clampFloat(value, 0.0f, 255.0f) / 255.0f;
  return clampByte((int)(powf(normalized, 1.35f) * 255.0f + 0.5f));
}

uint32_t correctedColor(uint8_t red, uint8_t green, uint8_t blue, float brightness) {
  float warmedRed = red * 1.14f;
  float warmedGreen = green * 1.00f;
  float warmedBlue = blue * 0.64f;

  return strip.Color(
    gammaCorrect(warmedRed * brightness),
    gammaCorrect(warmedGreen * brightness),
    gammaCorrect(warmedBlue * brightness)
  );
}

const char *renderModeName() {
  switch (renderMode) {
    case MODE_ACCURATE_AMBIENT:
      return "accurate_ambient";
    case MODE_AUDIO_ORB:
      return "audio_orb";
    case MODE_DIAGNOSTIC_METER:
      return "diagnostic_meter";
    case MODE_SOLID_TEST:
      return "solid_test";
    case MODE_LIVING_BREATH:
    default:
      return "living_breath";
  }
}

bool setRenderMode(String modeName) {
  modeName.trim();
  modeName.toLowerCase();

  if (modeName == "living_breath" || modeName == "living" || modeName == "breath") {
    renderMode = MODE_LIVING_BREATH;
  } else if (modeName == "accurate_ambient" || modeName == "ambient") {
    renderMode = MODE_ACCURATE_AMBIENT;
  } else if (modeName == "audio_orb" || modeName == "orb") {
    renderMode = MODE_AUDIO_ORB;
  } else if (modeName == "diagnostic_meter" || modeName == "diagnostic" || modeName == "meter") {
    renderMode = MODE_DIAGNOSTIC_METER;
  } else if (modeName == "solid_test" || modeName == "solid" || modeName == "test") {
    renderMode = MODE_SOLID_TEST;
  } else {
    return false;
  }

  Serial.print("Render mode changed to ");
  Serial.println(renderModeName());
  return true;
}

void parsePalette(String encoded) {
  int values[9];
  int valueIndex = 0;
  int start = 0;

  while (valueIndex < 9 && start < encoded.length()) {
    int comma = encoded.indexOf(',', start);
    String part = comma == -1 ? encoded.substring(start) : encoded.substring(start, comma);
    values[valueIndex] = constrain(part.toInt(), 0, 255);
    valueIndex++;

    if (comma == -1) break;
    start = comma + 1;
  }

  if (valueIndex == 9) {
    int index = 0;
    for (int color = 0; color < 3; color++) {
      for (int channel = 0; channel < 3; channel++) {
        targetPalette[color][channel] = values[index++];
      }
    }
  }
}

void blendPaletteStep() {
  for (int color = 0; color < 3; color++) {
    for (int channel = 0; channel < 3; channel++) {
      currentPalette[color][channel] = mixByte(
        currentPalette[color][channel],
        targetPalette[color][channel],
        0.18f
      );
    }
  }
}

void triggerEvent(String eventName) {
  if (eventName == "beat") {
    beatPulse = 1.0f;
  } else if (eventName == "spark") {
    sparklePulse = 1.0f;
  } else if (eventName == "peak") {
    peakPulse = 1.0f;
  } else if (eventName == "quiet") {
    quietPulse = 1.0f;
  }
}

void recordPacket(unsigned long sequence = 0) {
  unsigned long now = millis();
  if (lastPacketAt > 0) {
    lastPacketGapMs = now - lastPacketAt;
    if (lastPacketGapMs > maxPacketGapMs) {
      maxPacketGapMs = lastPacketGapMs;
    }
  }
  lastPacketAt = now;
  packetCount++;

  if (packetCount <= 3 || packetCount == 10) {
    Serial.print("Received LED packet #");
    Serial.print(packetCount);
    Serial.print(" mode=");
    Serial.print(renderModeName());
    Serial.print(" level=");
    Serial.print(targetLevel);
    Serial.print(" bass=");
    Serial.print(bassPercent);
    Serial.print(" mid=");
    Serial.print(midPercent);
    Serial.print(" treble=");
    Serial.println(treblePercent);
  }

  if (sequence > 0) {
    if (lastSequence > 0 && sequence > lastSequence + 1) {
      droppedFrames += sequence - lastSequence - 1;
    }
    if (sequence > lastSequence) {
      lastSequence = sequence;
    }
  }
}

void applyLevelValues(int level, int bass, int mid, int treble, String eventName) {
  if (testModeUntil > millis()) {
    return;
  }

  targetLevel = constrain(level, 0, LED_COUNT);
  bassPercent = constrain(bass, 0, 100);
  midPercent = constrain(mid, 0, 100);
  treblePercent = constrain(treble, 0, 100);
  hasReceivedFrame = true;
  triggerEvent(eventName);
}

void setAllPixels(uint8_t red, uint8_t green, uint8_t blue) {
  for (int i = 0; i < LED_COUNT; i++) {
    strip.setPixelColor(i, strip.Color(red, green, blue));
  }
  strip.show();
}

void runBootLedTest() {
  setAllPixels(42, 0, 0);
  delay(220);
  setAllPixels(0, 42, 0);
  delay(220);
  setAllPixels(0, 0, 42);
  delay(220);
  setAllPixels(36, 36, 36);
  delay(260);
  setAllPixels(0, 0, 0);
}

void blinkStatus(uint8_t red, uint8_t green, uint8_t blue, int flashes) {
  for (int index = 0; index < flashes; index++) {
    setAllPixels(red, green, blue);
    delay(180);
    setAllPixels(0, 0, 0);
    delay(140);
  }
}

void smoothInputState() {
  displayedLevel += (targetLevel - displayedLevel) * 0.42f;
  smoothedLoudness += ((displayedLevel / (float)LED_COUNT) - smoothedLoudness) * 0.055f;
  smoothedBass += ((bassPercent / 100.0f) - smoothedBass) * 0.075f;
  smoothedMid += ((midPercent / 100.0f) - smoothedMid) * 0.05f;
  smoothedTreble += ((treblePercent / 100.0f) - smoothedTreble) * 0.05f;
}

void getMoodColor(uint8_t &red, uint8_t &green, uint8_t &blue) {
  red = clampByte((int)(currentPalette[0][0] * 0.90f + currentPalette[1][0] * 0.06f + currentPalette[2][0] * 0.04f));
  green = clampByte((int)(currentPalette[0][1] * 0.90f + currentPalette[1][1] * 0.06f + currentPalette[2][1] * 0.04f));
  blue = clampByte((int)(currentPalette[0][2] * 0.90f + currentPalette[1][2] * 0.06f + currentPalette[2][2] * 0.04f));

  int strongest = max(red, max(green, blue));
  if (strongest < 22) {
    red = mixByte(red, 18, 0.55f);
    green = mixByte(green, 22, 0.55f);
    blue = mixByte(blue, 32, 0.55f);
  }
}

void renderSolidTest() {
  uint8_t red;
  uint8_t green;
  uint8_t blue;
  getMoodColor(red, green, blue);

  float brightness = testModeUntil > millis() ? 0.9f : 0.24f;
  for (int i = 0; i < LED_COUNT; i++) {
    strip.setPixelColor(i, correctedColor(red, green, blue, brightness));
  }
}

void renderLivingBreath() {
  unsigned long now = millis();
  if (lastLivingStepAt == 0) {
    lastLivingStepAt = now;
  }

  float deltaSeconds = clampFloat((now - lastLivingStepAt) / 1000.0f, 0.0f, 0.08f);
  lastLivingStepAt = now;

  float audioLift = hasReceivedFrame ? smoothedLoudness : 0.0f;
  float modeGain = renderMode == MODE_AUDIO_ORB ? 1.45f : 1.0f;
  float ambientGain = renderMode == MODE_ACCURATE_AMBIENT ? 0.28f : 1.0f;
  float breathSpeed = 0.108f + smoothedBass * 0.018f;
  breathPhase += deltaSeconds * breathSpeed * 6.28318f;
  if (breathPhase > 6.28318f) {
    breathPhase -= 6.28318f;
  }

  uint8_t moodRed;
  uint8_t moodGreen;
  uint8_t moodBlue;
  getMoodColor(moodRed, moodGreen, moodBlue);

  float paletteLuma = (moodRed * 0.2126f + moodGreen * 0.7152f + moodBlue * 0.0722f) / 255.0f;
  float targetAmbient = hasReceivedFrame ? clampFloat(0.18f + paletteLuma * 0.18f + audioLift * 0.22f, 0.16f, 0.56f) : 0.055f;
  smoothedAmbient += (targetAmbient - smoothedAmbient) * 0.08f;

  float breath = 0.5f + 0.5f * sinf(breathPhase);
  breath = breath * breath * (3.0f - 2.0f * breath);
  float bassPulse = powf(smoothedBass, 1.55f) * 0.22f * modeGain * ambientGain;
  float breathAmount = (0.14f + breath * 0.26f + bassPulse + beatPulse * 0.16f + peakPulse * 0.10f) * ambientGain;

  if (quietPulse > 0.05f) {
    breathAmount *= 0.45f;
  }

  for (int i = 0; i < LED_COUNT; i++) {
    float position = i / (float)max(1, LED_COUNT - 1);
    float centerDistance = fabsf(position - 0.5f) * 2.0f;
    float centerWeight = 0.74f + powf(1.0f - clampFloat(centerDistance, 0.0f, 1.0f), 1.8f) * 0.34f;
    float perLedOffset = sinf(i * 1.618f + now / 4700.0f) * 0.018f;
    float slowTexture = sinf(i * 0.37f + now / 6300.0f) * 0.014f;
    float shimmerNoise = sinf(i * 2.41f + now / 145.0f) * sinf(i * 0.73f + now / 910.0f);
    float trebleShimmer = shimmerNoise * smoothedTreble * 0.018f * ambientGain;
    float brightness = (smoothedAmbient + breathAmount + perLedOffset + slowTexture + trebleShimmer) * centerWeight;

    uint8_t red = mixByte(moodRed, currentPalette[1][0], 0.08f + max(0.0f, perLedOffset) * 2.0f);
    uint8_t green = mixByte(moodGreen, currentPalette[1][1], 0.08f + max(0.0f, slowTexture) * 2.0f);
    uint8_t blue = mixByte(moodBlue, currentPalette[1][2], 0.08f + max(0.0f, trebleShimmer) * 2.5f);

    brightness = clampFloat(brightness, hasReceivedFrame ? 0.10f : 0.0f, renderMode == MODE_AUDIO_ORB ? 0.95f : 0.86f);
    strip.setPixelColor(i, correctedColor(red, green, blue, brightness));
  }
}

void renderDiagnosticMeter() {

  float loudness = displayedLevel / (float)LED_COUNT;
  float bassBoost = bassPercent / 100.0f;
  float midBoost = midPercent / 100.0f;
  float trebleBoost = treblePercent / 100.0f;
  float breathe = 0.72f + 0.28f * sin(millis() / 1100.0f);

  float baseBrightness = hasReceivedFrame ? 0.06f + loudness * 0.38f : 0.0f;
  baseBrightness += bassBoost * 0.12f;
  baseBrightness += midBoost * 0.05f;

  if (quietPulse > 0.05f) {
    baseBrightness = 0.025f + 0.06f * breathe;
  }

  for (int i = 0; i < LED_COUNT; i++) {
    float position = i / (float)max(1, LED_COUNT - 1);
    float colorPhase = position * 2.0f + millis() / 4200.0f + bassBoost * 0.35f;
    float wrappedPhase = colorPhase - floor(colorPhase);
    float colorMix = wrappedPhase * 2.0f;
    int firstColor = (int)floor(colorPhase * 3.0f) % 3;
    int secondColor = (firstColor + 1) % 3;

    if (colorMix > 1.0f) {
      colorMix = 2.0f - colorMix;
    }

    uint8_t red = mixByte(currentPalette[firstColor][0], currentPalette[secondColor][0], colorMix);
    uint8_t green = mixByte(currentPalette[firstColor][1], currentPalette[secondColor][1], colorMix);
    uint8_t blue = mixByte(currentPalette[firstColor][2], currentPalette[secondColor][2], colorMix);

    float wave = 0.5f + 0.5f * sin((position * 6.28318f * 2.0f) - millis() / 360.0f);
    float bassWave = 0.5f + 0.5f * sin((position * 6.28318f) + millis() / 190.0f);
    float brightness = baseBrightness;
    brightness += wave * midBoost * 0.10f;
    brightness += bassWave * bassBoost * 0.14f;

    float centerDistance = fabsf(i - (LED_COUNT - 1) / 2.0f) / (LED_COUNT / 2.0f);
    brightness += max(0.0f, 1.0f - centerDistance * 1.3f) * beatPulse * 0.22f;
    brightness += peakPulse * 0.16f;

    bool sparkle = sparklePulse > 0.05f && ((i + millis() / 80) % 13 == 0);
    bool trebleSparkle = trebleBoost > 0.38f && ((i + millis() / 95) % 11 == 0);

    if (sparkle || trebleSparkle) {
      red = min(255, red + 46);
      green = min(255, green + 46);
      blue = min(255, blue + 46);
      brightness += 0.12f;
    }

    brightness = clampFloat(brightness, 0.0f, 0.78f);

    strip.setPixelColor(
      i,
      correctedColor(red, green, blue, brightness)
    );
  }
}

void drawStrip() {
  blendPaletteStep();

  if (testModeUntil > millis()) {
    targetLevel = LED_COUNT;
    bassPercent = 100;
    midPercent = 80;
    treblePercent = 80;
    hasReceivedFrame = true;
  }

  smoothInputState();

  if (testModeUntil > millis() || renderMode == MODE_SOLID_TEST) {
    renderSolidTest();
  } else if (renderMode == MODE_DIAGNOSTIC_METER) {
    renderDiagnosticMeter();
  } else {
    renderLivingBreath();
  }

  strip.show();
  drawCount++;

  beatPulse *= 0.90f;
  sparklePulse *= 0.86f;
  peakPulse *= 0.92f;
  quietPulse *= 0.988f;
}

void handleLevel() {
  if (!server.hasArg("value")) {
    server.send(400, "text/plain", "Missing value");
    return;
  }

  if (testModeUntil > millis()) {
    server.send(200, "text/plain", "TEST_ACTIVE");
    return;
  }

  int nextBass = server.hasArg("bass") ? server.arg("bass").toInt() : bassPercent;
  int nextMid = server.hasArg("mid") ? server.arg("mid").toInt() : midPercent;
  int nextTreble = server.hasArg("treble") ? server.arg("treble").toInt() : treblePercent;
  String eventName = server.hasArg("event") ? server.arg("event") : "none";
  if (server.hasArg("mode")) setRenderMode(server.arg("mode"));
  applyLevelValues(server.arg("value").toInt(), nextBass, nextMid, nextTreble, eventName);
  if (server.hasArg("palette")) parsePalette(server.arg("palette"));
  if (server.hasArg("sent")) lastSentAt = server.arg("sent").toInt();

  recordPacket(server.hasArg("seq") ? server.arg("seq").toInt() : 0);

  server.send(200, "text/plain", "OK");
}

void handleUdpPackets() {
  int packetSize = ledUdp.parsePacket();
  if (packetSize <= 0) {
    return;
  }

  char buffer[UDP_BUFFER_SIZE] = {0};
  int length = ledUdp.read(buffer, sizeof(buffer) - 1);
  if (length <= 0) {
    return;
  }

  buffer[length] = '\0';
  String packet = String(buffer);
  packet.trim();

  if (packet.startsWith("MODE:")) {
    packet.remove(0, 5);
    if (setRenderMode(packet)) {
      recordPacket();
    }
    return;
  }

  if (packet.startsWith("LED:")) {
    packet.remove(0, 4);
    int values[6] = {0};
    int valueIndex = 0;
    int start = 0;

    while (valueIndex < 6 && start <= packet.length()) {
      int comma = packet.indexOf(',', start);
      String part = comma == -1 ? packet.substring(start) : packet.substring(start, comma);
      values[valueIndex] = constrain(part.toInt(), 0, valueIndex < 3 ? 255 : 100);
      valueIndex++;

      if (comma == -1) break;
      start = comma + 1;
    }

    if (valueIndex != 6) {
      return;
    }

    targetPalette[0][0] = values[0];
    targetPalette[0][1] = values[1];
    targetPalette[0][2] = values[2];
    targetPalette[1][0] = mixByte(values[0], 255, 0.06f);
    targetPalette[1][1] = mixByte(values[1], 255, 0.06f);
    targetPalette[1][2] = mixByte(values[2], 255, 0.06f);
    targetPalette[2][0] = clampByte((int)(values[0] * 0.48f));
    targetPalette[2][1] = clampByte((int)(values[1] * 0.48f));
    targetPalette[2][2] = clampByte((int)(values[2] * 0.48f));
    applyLevelValues(map(values[3], 0, 100, 0, LED_COUNT), values[4], midPercent, values[5], "udp");
    recordPacket();
    return;
  }

  if (packet.startsWith("PIX:")) {
    packet.remove(0, 4);
    long totalRed = 0;
    long totalGreen = 0;
    long totalBlue = 0;
    long totalLuma = 0;
    int rgbIndex = 0;
    int pixelCount = 0;
    int channelValues[3] = {0};
    int start = 0;

    while (start <= packet.length()) {
      int comma = packet.indexOf(',', start);
      String part = comma == -1 ? packet.substring(start) : packet.substring(start, comma);
      channelValues[rgbIndex] = constrain(part.toInt(), 0, 255);
      rgbIndex++;

      if (rgbIndex == 3) {
        totalRed += channelValues[0];
        totalGreen += channelValues[1];
        totalBlue += channelValues[2];
        totalLuma += (channelValues[0] * 21 + channelValues[1] * 72 + channelValues[2] * 7) / 100;
        pixelCount++;
        rgbIndex = 0;
      }

      if (comma == -1) break;
      start = comma + 1;
    }

    if (pixelCount <= 0) {
      return;
    }

    int averageRed = constrain(totalRed / pixelCount, 0, 255);
    int averageGreen = constrain(totalGreen / pixelCount, 0, 255);
    int averageBlue = constrain(totalBlue / pixelCount, 0, 255);
    int averageLuma = constrain(totalLuma / pixelCount, 0, 255);
    int level = map(averageLuma, 0, 255, 0, LED_COUNT);
    int bass = constrain((averageRed * 55 + averageGreen * 25 + averageLuma * 20) / 255, 0, 100);
    int treble = constrain((averageBlue * 70 + averageLuma * 30) / 255, 0, 100);

    targetPalette[0][0] = averageRed;
    targetPalette[0][1] = averageGreen;
    targetPalette[0][2] = averageBlue;
    targetPalette[1][0] = mixByte(averageRed, 255, 0.06f);
    targetPalette[1][1] = mixByte(averageGreen, 255, 0.06f);
    targetPalette[1][2] = mixByte(averageBlue, 255, 0.06f);
    targetPalette[2][0] = clampByte((int)(averageRed * 0.48f));
    targetPalette[2][1] = clampByte((int)(averageGreen * 0.48f));
    targetPalette[2][2] = clampByte((int)(averageBlue * 0.48f));
    applyLevelValues(level, bass, midPercent, treble, "pix");
    recordPacket();
    return;
  }
}

void handleRoot() {
  server.send(200, "text/plain", "ESP32 LED Visualizer living_breath mode");
}

void handleTest() {
  hasReceivedFrame = true;
  testModeUntil = millis() + 3000;
  targetLevel = LED_COUNT;
  bassPercent = 100;
  midPercent = 60;
  treblePercent = 60;
  peakPulse = 1.0f;
  server.send(200, "text/plain", "TEST");
}

void handleMode() {
  if (!server.hasArg("value")) {
    server.send(200, "text/plain", renderModeName());
    return;
  }

  if (!setRenderMode(server.arg("value"))) {
    server.send(400, "text/plain", "Unknown mode");
    return;
  }

  server.send(200, "text/plain", renderModeName());
}

void handleStatus() {
  String json = "{";
  json += "\"ok\":true";
  json += ",\"device\":\"" + String(DEVICE_HOSTNAME) + "\"";
  json += ",\"packets\":" + String(packetCount);
  json += ",\"dropped\":" + String(droppedFrames);
  json += ",\"seq\":" + String(lastSequence);
  json += ",\"fps\":" + String(packetFps);
  json += ",\"drawFps\":" + String(drawFps);
  json += ",\"level\":" + String(targetLevel);
  json += ",\"displayed\":" + String(displayedLevel, 1);
  json += ",\"bass\":" + String(bassPercent);
  json += ",\"mid\":" + String(midPercent);
  json += ",\"treble\":" + String(treblePercent);
  json += ",\"lastGapMs\":" + String(lastPacketGapMs);
  json += ",\"maxGapMs\":" + String(maxPacketGapMs);
  json += ",\"ageMs\":" + String(lastPacketAt > 0 ? millis() - lastPacketAt : 0);
  json += ",\"mode\":\"" + String(renderModeName()) + "\"";
  json += ",\"wifi\":\"" + String(wifiStationConnected ? "sta" : "ap") + "\"";
  json += ",\"ip\":\"" + String(wifiStationConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\"";
  json += ",\"rssi\":" + String(wifiStationConnected ? WiFi.RSSI() : 0);
  json += ",\"uptimeMs\":" + String(millis());
  json += "}";

  server.send(200, "application/json", json);
}

void updateStats() {
  unsigned long now = millis();
  if (now - lastStatsAt < 2000) {
    return;
  }

  unsigned long elapsed = max(1UL, now - lastStatsAt);
  packetFps = (int)((packetCount - packetsAtLastStats) * 1000UL / elapsed);
  drawFps = (int)((drawCount - drawsAtLastStats) * 1000UL / elapsed);
  packetsAtLastStats = packetCount;
  drawsAtLastStats = drawCount;
  lastStatsAt = now;

  Serial.print("led-sync packets=");
  Serial.print(packetCount);
  Serial.print(" fps=");
  Serial.print(packetFps);
  Serial.print(" draw=");
  Serial.print(drawFps);
  Serial.print(" dropped=");
  Serial.print(droppedFrames);
  Serial.print(" level=");
  Serial.print(targetLevel);
  Serial.print(" displayed=");
  Serial.print(displayedLevel, 1);
  Serial.print(" gap=");
  Serial.print(lastPacketGapMs);
  Serial.print(" maxGap=");
  Serial.print(maxPacketGapMs);
  Serial.print(" mode=");
  Serial.print(renderModeName());
  Serial.print(" ip=");
  Serial.println(wifiStationConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString());
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi ");
  Serial.print(WIFI_SSID);
  Serial.println(" ...");

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiStationConnected = true;
    Serial.println();
    Serial.println("Wi-Fi connected!");
    Serial.print("ESP32 IP address: ");
    Serial.println(WiFi.localIP());
    if (MDNS.begin(DEVICE_HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.print("mDNS address: http://");
      Serial.print(DEVICE_HOSTNAME);
      Serial.println(".local/");
    }
    blinkStatus(0, 44, 0, 3);
    return;
  }

  wifiStationConnected = false;
  Serial.println();
  Serial.println("Wi-Fi station connection failed.");
  Serial.print("Starting fallback AP: ");
  Serial.println(FALLBACK_AP_NAME);

  WiFi.disconnect(true);
  delay(250);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(FALLBACK_AP_NAME, FALLBACK_AP_PASS);

  Serial.print("Fallback AP IP address: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("Connect this PC to that Wi-Fi network, then use the AP IP in the app.");
  blinkStatus(44, 26, 0, 5);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  strip.begin();
  strip.setBrightness(128);
  strip.show();
  runBootLedTest();

  Serial.println();
  Serial.println("AudioVisualizer LED firmware booted.");
  connectWiFi();

  server.on("/", handleRoot);
  server.on("/level", handleLevel);
  server.on("/status", handleStatus);
  server.on("/test", handleTest);
  server.on("/mode", handleMode);
  server.begin();
  ledUdp.begin(UDP_PORT);

  Serial.println("HTTP server started");
  Serial.print("UDP LED port: ");
  Serial.println(UDP_PORT);
  Serial.print("Default render mode: ");
  Serial.println(renderModeName());
}

void loop() {
  server.handleClient();
  handleUdpPackets();

  unsigned long now = millis();
  if (now - lastFrameAt >= FRAME_INTERVAL_MS) {
    lastFrameAt = now;
    drawStrip();
  }

  delay(1);
  updateStats();
}
