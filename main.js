const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  session
} = require("electron");
const { execFile } = require("child_process");
const dgram = require("dgram");
const http = require("http");
const os = require("os");
const path = require("path");

let mainWindow;
let volumeReadFailed = false;
let selectedDisplayId = null;
let selectedDisplaySourceId = null;
const esp32Agent = new http.Agent({
  keepAlive: true,
  maxSockets: 1,
  timeout: 2000
});
const ledUdpSocket = dgram.createSocket("udp4");
const volumeScriptPath = path.join(__dirname, "scripts", "get-system-volume.ps1");
const accentColorScriptPath = path.join(__dirname, "scripts", "get-accent-color.ps1");
const wallpaperColorScriptPath = path.join(__dirname, "scripts", "get-wallpaper-color.ps1");
const nowPlayingColorScriptPath = path.join(__dirname, "scripts", "get-now-playing-color.ps1");

async function getScreenSources() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const displaysById = new Map(
    screen.getAllDisplays().map((display) => [String(display.id), display])
  );
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 }
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    displayId: source.display_id,
    bounds: displaysById.get(source.display_id)?.bounds ?? null,
    isPrimary: source.display_id === String(primaryDisplay.id)
  }));
}

async function getPreferredDisplaySource() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 }
  });

  return (
    sources.find((source) => source.display_id === selectedDisplayId) ??
    sources.find((source) => source.id === selectedDisplaySourceId) ??
    sources.find((source) => source.display_id === String(primaryDisplay.id)) ??
    sources[0]
  );
}

function getSelectedDisplay() {
  const displays = screen.getAllDisplays();
  return (
    displays.find((display) => String(display.id) === selectedDisplayId) ??
    screen.getPrimaryDisplay()
  );
}

function getCompanionDisplay() {
  const displays = [...screen.getAllDisplays()].sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) {
      return a.bounds.x - b.bounds.x;
    }

    return a.bounds.y - b.bounds.y;
  });

  const selected = getSelectedDisplay();
  return (
    displays.find((display) => String(display.id) !== String(selected.id) && display.bounds.x > selected.bounds.x) ??
    displays.find((display) => String(display.id) !== String(selected.id)) ??
    selected
  );
}

function placeWindowOnDisplay(display) {
  if (!mainWindow || mainWindow.isDestroyed() || !display) {
    return false;
  }

  const { bounds, workArea } = display;
  const width = Math.min(1440, Math.max(900, workArea.width - 120));
  const height = Math.min(900, Math.max(640, workArea.height - 120));
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);

  mainWindow.setBounds({ x, y, width, height });
  return bounds;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#07111f",
    title: "Living Ambient Light",
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

function runColorScript(scriptPath) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath
      ],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error) {
          console.error(`Unable to read color from ${path.basename(scriptPath)}:`, error);
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(String(stdout).trim());
          if (
            parsed &&
            Number.isFinite(parsed.red) &&
            Number.isFinite(parsed.green) &&
            Number.isFinite(parsed.blue)
          ) {
            resolve(parsed);
            return;
          }
        } catch (parseError) {
          console.error(`Unable to parse color from ${path.basename(scriptPath)}:`, parseError);
        }

        resolve(null);
      }
    );
  });
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const source = await getPreferredDisplaySource();
      callback({
        video: source,
        audio: "loopback"
      });
    },
    { useSystemPicker: false }
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("system:get-volume", async () => {
  if (process.platform !== "win32") {
    return null;
  }

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        volumeScriptPath
      ],
      { windowsHide: true, timeout: 8000 },
      (error, stdout) => {
        if (error) {
          if (!volumeReadFailed) {
            console.warn("System volume meter unavailable; visualizer will continue without it.");
            volumeReadFailed = true;
          }
          resolve(null);
          return;
        }

        volumeReadFailed = false;
        const parsed = Number.parseInt(String(stdout).trim(), 10);
        resolve(Number.isFinite(parsed) ? parsed : null);
      }
    );
  });
});

ipcMain.handle("display:list-sources", async () => {
  return getScreenSources();
});

ipcMain.handle("display:set-source", async (_event, sourceId) => {
  const selectedValue = String(sourceId || "").trim();
  const sources = await getScreenSources();
  const matchingSource =
    sources.find((source) => source.displayId === selectedValue) ??
    sources.find((source) => source.id === selectedValue) ??
    null;

  selectedDisplayId = matchingSource?.displayId || selectedValue || null;
  selectedDisplaySourceId = matchingSource?.id || null;
  return true;
});

ipcMain.handle("window:move-off-capture", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (mainWindow.isFullScreen()) {
    return false;
  }

  return Boolean(placeWindowOnDisplay(getCompanionDisplay()));
});

ipcMain.handle("window:get-mode", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return "fullscreen";
  }

  return mainWindow.isFullScreen() ? "fullscreen" : "windowed";
});

ipcMain.handle("window:set-mode", (_event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  const shouldFullscreen = mode !== "windowed";
  mainWindow.setFullScreen(shouldFullscreen);
  if (!shouldFullscreen) {
    placeWindowOnDisplay(getCompanionDisplay());
  }

  return true;
});

ipcMain.handle("app:exit", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    return true;
  }

  app.quit();
  return true;
});

ipcMain.on("led:send-packet", (_event, payload) => {
  const packet = typeof payload?.packet === "string" ? payload.packet : "";
  const host = typeof payload?.host === "string" ? payload.host.trim() : "";
  const port = Number.parseInt(payload?.port, 10);

  if (!packet || !host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return;
  }

  ledUdpSocket.send(Buffer.from(packet), port, host, (error) => {
    if (error) {
      console.warn("Unable to send LED UDP packet:", error.message);
    }
  });
});

function requestEsp32(host, pathName, timeout = 180) {
  const safeHost = String(host || "").trim();

  if (!safeHost) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: safeHost,
        port: 80,
        path: pathName,
        agent: esp32Agent,
        timeout
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, body });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });

    request.on("error", () => {
      resolve(null);
    });
  });
}

function getLocalIpv4Subnets() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => {
      return network && network.family === "IPv4" && !network.internal && network.address;
    })
    .map((network) => {
      const parts = network.address.split(".");
      return parts.length === 4 ? parts.slice(0, 3).join(".") : null;
    })
    .filter(Boolean);
}

function parseEsp32Status(host, response) {
  if (!response?.ok) {
    return null;
  }

  try {
    const status = JSON.parse(response.body);
    if (
      status?.ok === true &&
      typeof status.mode === "string" &&
      Object.prototype.hasOwnProperty.call(status, "packets") &&
      typeof status.ip === "string"
    ) {
      return {
        ...status,
        host,
        device: status.device || "esp32-led-visualizer"
      };
    }
  } catch (_error) {
    return null;
  }

  return null;
}

async function discoverEsp32() {
  const mdnsStatus = parseEsp32Status(
    "esp32-led-visualizer.local",
    await requestEsp32("esp32-led-visualizer.local", "/status", 700)
  );
  if (mdnsStatus) {
    return mdnsStatus;
  }

  const subnets = [...new Set(getLocalIpv4Subnets())];

  for (const subnet of subnets) {
    const candidates = Array.from({ length: 254 }, (_item, index) => `${subnet}.${index + 1}`);
    const batchSize = 32;

    for (let index = 0; index < candidates.length; index += batchSize) {
      const batch = candidates.slice(index, index + batchSize);
      const results = await Promise.all(batch.map(async (host) => {
        return parseEsp32Status(host, await requestEsp32(host, "/status", 180));
      }));
      const match = results.find(Boolean);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

ipcMain.handle("esp32:set-level", async (_event, host, level, bass = 0, mid = 0, treble = 0, palette = null, audioEvent = "none", sequence = 0, sentAt = 0) => {
  const safeLevel = Math.min(60, Math.max(0, Number.parseInt(level, 10) || 0));
  const safeBass = Math.min(100, Math.max(0, Number.parseInt(bass, 10) || 0));
  const safeMid = Math.min(100, Math.max(0, Number.parseInt(mid, 10) || 0));
  const safeTreble = Math.min(100, Math.max(0, Number.parseInt(treble, 10) || 0));
  const safeEvent = String(audioEvent || "none").replace(/[^a-z]/gi, "").slice(0, 12) || "none";
  const safeSequence = Math.min(999999999, Math.max(0, Number.parseInt(sequence, 10) || 0));
  const safeSentAt = Math.min(999999999, Math.max(0, Number.parseInt(sentAt, 10) || 0));
  const safePalette = Array.isArray(palette) ? palette.slice(0, 9).map((value) => {
    return Math.min(255, Math.max(0, Number.parseInt(value, 10) || 0));
  }) : [];
  const pathName =
    `/level?value=${safeLevel}` +
    `&bass=${safeBass}` +
    `&mid=${safeMid}` +
    `&treble=${safeTreble}` +
    `&event=${safeEvent}` +
    `&seq=${safeSequence}` +
    `&sent=${safeSentAt}` +
    `&palette=${safePalette.join(",")}`;
  const response = await requestEsp32(host, pathName, 180);

  return Boolean(response?.ok);
});

ipcMain.handle("esp32:get-status", async (_event, host) => {
  return parseEsp32Status(host, await requestEsp32(host, "/status", 500));
});

ipcMain.handle("esp32:test", async (_event, host) => {
  const response = await requestEsp32(host, "/test", 500);
  return Boolean(response?.ok);
});

ipcMain.handle("esp32:discover", async () => {
  return discoverEsp32();
});

ipcMain.handle("system:get-accent-color", async () => {
  if (process.platform !== "win32") {
    return null;
  }

  return runColorScript(accentColorScriptPath);
});

ipcMain.handle("system:get-wallpaper-color", async () => {
  if (process.platform !== "win32") {
    return null;
  }

  return runColorScript(wallpaperColorScriptPath);
});

ipcMain.handle("system:get-now-playing-color", async () => {
  if (process.platform !== "win32") {
    return null;
  }

  return runColorScript(nowPlayingColorScriptPath);
});
