$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

function Await($asyncOperation, [Type]$resultType) {
    $method = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethodDefinition })[0]
    $genericMethod = $method.MakeGenericMethod(@($resultType))
    $task = $genericMethod.Invoke($null, @($asyncOperation))
    $task.Wait()
    return $task.Result
}

$manager = Await (
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]::RequestAsync()
) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$session = $manager.GetCurrentSession()
if ($null -eq $session) {
    throw "No current media session."
}

$mediaProperties = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
if ($null -eq $mediaProperties -or $null -eq $mediaProperties.Thumbnail) {
    throw "No current media artwork."
}

$streamReference = $mediaProperties.Thumbnail
$randomAccessStream = Await ($streamReference.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
$bufferSize = [uint32][Math]::Min([uint64]$randomAccessStream.Size, [uint64]4194304)
$buffer = New-Object Windows.Storage.Streams.Buffer($bufferSize)
$filledBuffer = Await (
    $randomAccessStream.ReadAsync($buffer, $bufferSize, [Windows.Storage.Streams.InputStreamOptions]::None)
) ([Windows.Storage.Streams.IBuffer])
$reader = [Windows.Storage.Streams.DataReader]::FromBuffer($filledBuffer)
$bytes = New-Object byte[] $filledBuffer.Length
$reader.ReadBytes($bytes)
$reader.Dispose()
$randomAccessStream.Dispose()

$memoryStream = New-Object System.IO.MemoryStream(, $bytes)
$bitmap = [System.Drawing.Bitmap]::new($memoryStream)

try {
    $stepX = [Math]::Max(1, [int]($bitmap.Width / 24))
    $stepY = [Math]::Max(1, [int]($bitmap.Height / 24))

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
        throw "Unable to sample media artwork."
    }

    [pscustomobject]@{
        red = [int]($red / $count)
        green = [int]($green / $count)
        blue = [int]($blue / $count)
    } | ConvertTo-Json -Compress
}
finally {
    $bitmap.Dispose()
    $memoryStream.Dispose()
}
