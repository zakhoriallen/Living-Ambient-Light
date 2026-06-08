$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$wallpaperPath = (Get-ItemProperty "HKCU:\Control Panel\Desktop").Wallpaper

if ([string]::IsNullOrWhiteSpace($wallpaperPath) -or -not (Test-Path $wallpaperPath)) {
    $transcoded = Join-Path $env:APPDATA "Microsoft\Windows\Themes\TranscodedWallpaper"
    if (Test-Path $transcoded) {
        $wallpaperPath = $transcoded
    }
}

if ([string]::IsNullOrWhiteSpace($wallpaperPath) -or -not (Test-Path $wallpaperPath)) {
    throw "Wallpaper image not found."
}

$bitmap = [System.Drawing.Bitmap]::new($wallpaperPath)

try {
    $stepX = [Math]::Max(1, [int]($bitmap.Width / 36))
    $stepY = [Math]::Max(1, [int]($bitmap.Height / 36))

    $red = 0
    $green = 0
    $blue = 0
    $count = 0

    for ($x = 0; $x -lt $bitmap.Width; $x += $stepX) {
        for ($y = 0; $y -lt $bitmap.Height; $y += $stepY) {
            $pixel = $bitmap.GetPixel($x, $y)
            $red += $pixel.R
            $green += $pixel.G
            $blue += $pixel.B
            $count += 1
        }
    }

    if ($count -eq 0) {
        throw "Unable to sample wallpaper image."
    }

    [pscustomobject]@{
        red = [int]($red / $count)
        green = [int]($green / $count)
        blue = [int]($blue / $count)
    } | ConvertTo-Json -Compress
}
finally {
    $bitmap.Dispose()
}
