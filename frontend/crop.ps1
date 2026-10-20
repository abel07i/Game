Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Users\abel w\OneDrive\Desktop\Game\frontend\public\steps12.jpg')
$bmp1 = New-Object System.Drawing.Bitmap(280, 260)
$g1 = [System.Drawing.Graphics]::FromImage($bmp1)
$g1.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, 280, 260)), (New-Object System.Drawing.Rectangle(47, 180, 280, 260)), [System.Drawing.GraphicsUnit]::Pixel)
$bmp1.Save('c:\Users\abel w\OneDrive\Desktop\Game\frontend\public\step_register_new.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)

$bmp2 = New-Object System.Drawing.Bitmap(280, 260)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, 280, 260)), (New-Object System.Drawing.Rectangle(47, 690, 280, 260)), [System.Drawing.GraphicsUnit]::Pixel)
$bmp2.Save('c:\Users\abel w\OneDrive\Desktop\Game\frontend\public\step_deposit_new.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
