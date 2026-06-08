$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$uiSettings = [Windows.UI.ViewManagement.UISettings, Windows.UI.ViewManagement, ContentType = WindowsRuntime]::new()
$accentType = [Windows.UI.ViewManagement.UIColorType]::Accent
$color = $uiSettings.GetColorValue($accentType)

[pscustomobject]@{
    red = [int]$color.R
    green = [int]$color.G
    blue = [int]$color.B
} | ConvertTo-Json -Compress
