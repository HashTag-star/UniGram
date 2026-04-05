New-Item -ItemType Directory -Force -Path "assets\fonts" | Out-Null
Invoke-WebRequest "https://github.com/googlefonts/outfit/raw/main/fonts/ttf/Outfit-Regular.ttf" -OutFile "assets\fonts\Outfit-Regular.ttf"
Invoke-WebRequest "https://github.com/googlefonts/outfit/raw/main/fonts/ttf/Outfit-SemiBold.ttf" -OutFile "assets\fonts\Outfit-SemiBold.ttf"
Invoke-WebRequest "https://github.com/googlefonts/outfit/raw/main/fonts/ttf/Outfit-Bold.ttf" -OutFile "assets\fonts\Outfit-Bold.ttf"
Invoke-WebRequest "https://github.com/googlefonts/outfit/raw/main/fonts/ttf/Outfit-ExtraBold.ttf" -OutFile "assets\fonts\Outfit-ExtraBold.ttf"
Write-Host "DONE"
