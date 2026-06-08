# Troubleshooting

## App Cannot Find ESP32

- Confirm the ESP32 is powered on.
- Confirm the ESP32 firmware was uploaded successfully.
- Make sure the PC and ESP32 are on the same Wi-Fi network.
- Click `Retry Discovery`.
- Enter the ESP32 IP manually if Serial Monitor shows one.

## `/status` Does Not Load

- Open `http://ESP32_IP/status` in a browser.
- If it does not load, check Wi-Fi credentials in the firmware.
- Reboot the ESP32.
- Confirm the firmware uses hostname `esp32-led-visualizer`.

## LEDs Do Not Turn On

- Check external LED power.
- Check shared ground between ESP32 and LED power supply.
- Confirm data wire is connected to GPIO 2, or update `LED_PIN`.
- Confirm LED strip direction.

## Wrong LED Colors

- Confirm the strip is WS2812/NeoPixel compatible.
- Check the color order in the firmware: `NEO_GRB`.
- Use Calibration mode and test red, green, blue, and white.

## App Opens But No Audio Movement

- Make sure audio is playing on the selected display/audio path.
- Try restarting the visualizer.
- Check Windows audio output device.
- If display capture has no audio track, the visual preview may run without spectrum data.

## Display Capture Not Working

- Pick the correct monitor in the Display dropdown.
- Try restarting the app.
- Try switching between fullscreen and windowed mode.

## Portable `.exe` Blocked By Windows

- Right-click the `.exe`, choose Properties, and select Unblock if shown.
- Choose `More info` then `Run anyway` in SmartScreen if you trust the build.

## ESP32 IP Changed

- Click `Find LEDs`.
- Use `Forget IP` if the saved address is stale.
- Reserve the ESP32 IP in your router DHCP settings for best reliability.

## Wi-Fi Credentials Wrong

- Update the firmware placeholders:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

- Re-upload the sketch.
- Watch Serial Monitor at `115200` baud for connection status.

## LED Strip Flickering

- Use a proper external LED power supply.
- Keep data and ground wiring short and solid.
- Add a resistor on the data line if needed.
- Lower brightness if power is marginal.

## Brownout / Power Issues

- Do not power a long LED strip from the ESP32 5V pin.
- Use external 5V power sized for the LED count.
- Connect ESP32 ground and LED power ground together.
- Watch Serial Monitor for brownout reset messages.
