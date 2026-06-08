# ESP32 LED Visualizer Firmware

This Arduino sketch matches the desktop app's ESP32 LED protocol.

## Hardware Assumptions

- ESP32 development board
- WS2812B / NeoPixel-style addressable LED strip
- 60 LEDs
- LED data pin on GPIO 18
- Common ground between ESP32 and LED power supply

If your strip uses a different data pin, LED count, color order, or chipset, update the constants near the top of `esp32_led_visualizer.ino`.

## Arduino IDE Setup

1. Install the ESP32 board package.
2. Install the `Adafruit NeoPixel` library from Library Manager.
3. Open `firmware/esp32_led_visualizer/esp32_led_visualizer.ino`.
4. Replace `YOUR_WIFI_NAME` and `YOUR_WIFI_PASSWORD`.
5. Select your ESP32 board and port.
6. Upload.
7. Open Serial Monitor at `115200` baud and note the printed IP address.

## Desktop App Setup

1. Start the Audio Visualizer app.
2. Put the ESP32 IP address into the LED host input.
3. Click `Test LEDs`.
4. Click `Start` to stream live audio levels.

The app can also discover the board if the board is on the same subnet. Discovery checks `/status` for a JSON field named `packets` and checks `/` for `ESP32 LED Visualizer`.

## ESP32 HTTP Endpoints

- `GET /` shows a tiny status page.
- `GET /status` returns JSON with `packets`, `level`, `bass`, `mid`, `treble`, `event`, `seq`, `fps`, and `ip`.
- `GET /test` runs a 5-second rainbow test.
- `GET /level?value=30&bass=80&mid=40&treble=60&event=beat&seq=1&sent=123&palette=28,92,86,240,198,92,156,92,240` updates the visualizer.

## Common Fixes

- If upload fails, hold `BOOT` while Arduino IDE says it is connecting.
- If the LED colors are wrong, change `NEO_GRB` in the `Adafruit_NeoPixel` setup.
- If nothing lights up, verify external LED power, common ground, data pin, and LED direction.
- If the desktop app says offline, confirm your PC and ESP32 are on the same network and open `http://ESP32_IP/status` in a browser.
