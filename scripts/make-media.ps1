Param(
  [Parameter(Mandatory=$true)][string]$Input,
  [string]$Start = "00:00:00",
  [int]$Duration = 0,
  [int]$Width = 800,
  [int]$Fps = 18,
  [string]$SnapOffset = "auto",
  [string]$Crop = ""
)

if (-not (Test-Path $Input)) { Write-Error "Input file not found: $Input"; exit 1 }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Error "ffmpeg not found in PATH"; exit 1 }

New-Item -ItemType Directory -Force -Path docs | Out-Null

$vf = "setpts=PTS-STARTPTS,fps=$Fps"
if ($Crop -ne "") { $vf = "$vf,crop=$Crop" }
$vf = "$vf,scale=$Width:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"

Write-Host "[media] Generating docs/preview.gif (start=$Start, duration=$Duration s, width=$Width, fps=$Fps)"
if ($Duration -le 0) {
  if ($env:DEBUG) {
    ffmpeg -y -ss $Start -fflags +genpts -i "$Input" -an -vf "$vf" -vsync 0 -loop 0 docs/preview.gif
  } else {
    ffmpeg -y -ss $Start -fflags +genpts -i "$Input" -an -vf "$vf" -vsync 0 -loop 0 docs/preview.gif | Out-Null
  }
} else {
  if ($env:DEBUG) {
    ffmpeg -y -ss $Start -fflags +genpts -i "$Input" -t $Duration -an -vf "$vf" -vsync 0 -loop 0 docs/preview.gif
  } else {
    ffmpeg -y -ss $Start -fflags +genpts -i "$Input" -t $Duration -an -vf "$vf" -vsync 0 -loop 0 docs/preview.gif | Out-Null
  }
}

# Snapshot time: auto = middle of clip
function Add-SecondsToHMS([string]$hms, [double]$seconds){
  $t = [TimeSpan]::Parse($hms)
  return ($t + [TimeSpan]::FromSeconds($seconds)).ToString("hh\:mm\:ss")
}
if ($SnapOffset -eq 'auto') {
  try {
    $dur = & ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=nw=1:nk=1 "$Input" 2>$null
    if (-not $dur) { $dur = 10 }
    $mid = [math]::Floor([double]$dur / 2)
    $snapTs = (Get-Date -Date "00:00:00").AddSeconds($mid).ToString("HH:mm:ss")
  } catch { $snapTs = $Start }
} else {
  $snapTs = Add-SecondsToHMS $Start ([double]$SnapOffset)
}

$vfCover = "scale=1200:630:force_original_aspect_ratio=decrease,pad=1200:630:(ow-iw)/2:(oh-ih)/2"
if ($Crop -ne "") { $vfCover = "crop=$Crop,$vfCover" }
Write-Host "[media] Creating docs/cover-1200x630.png @ $snapTs"
ffmpeg -y -i "$Input" -ss $snapTs -vframes 1 -vf "$vfCover" docs/cover-1200x630.png | Out-Null

$vfThumb = "scale=600:400:force_original_aspect_ratio=decrease,pad=600:400:(ow-iw)/2:(oh-ih)/2"
if ($Crop -ne "") { $vfThumb = "crop=$Crop,$vfThumb" }
Write-Host "[media] Creating docs/thumb-600x400.png @ $snapTs"
ffmpeg -y -i "$Input" -ss $snapTs -vframes 1 -vf "$vfThumb" docs/thumb-600x400.png | Out-Null

Write-Host "[media] Done. Files: docs/preview.gif, docs/cover-1200x630.png, docs/thumb-600x400.png"
