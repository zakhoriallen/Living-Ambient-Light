# Setup Guide

## 1. Install Node.js

Install the current LTS version of Node.js from the official Node.js website.

## 2. Clone Or Download The Project

Download or clone the project, then open a terminal in:

```powershell
C:\Projects\AudioVisualizer
```

## 3. Install App Dependencies

```powershell
npm install
```

## 4. Run The App From Source

```powershell
npm start
```

## 5. Flash ESP32 Firmware

Open this file in Arduino IDE:

```text
esp32_led_visualizer/esp32_led_visualizer.ino
```

Install the ESP32 board package and the `Adafruit NeoPixel` library.

Before uploading, set:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

Confirm the LED data pin and LED count:

```cpp
#define LED_PIN 2
#define LED_COUNT 60
```

Upload the sketch to the ESP32.

## 6. Connect To The Same Wi-Fi

Make sure the Windows PC and ESP32 are connected to the same Wi-Fi network.

## 7. Open The App

Launch the app from source with `npm start` or open the portable `.exe`.

## 8. Find And Test LEDs

1. Click `Find LEDs`.
2. Wait for `ESP32: Connected at x.x.x.x`.
3. Click `Test LEDs`.
4. Confirm the LED strip responds.

## 9. Use Living Breath Mode

Select `Living Breath` for the main ambient light behavior.
