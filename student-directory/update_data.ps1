# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$currentDir = Get-Location
Write-Host "Current Directory: $currentDir"

$xlsxPath = "$currentDir\data.xlsx"
$zipPath = "$currentDir\data.zip"
$tempDir = "$currentDir\xlsx_temp"
$jsonPath = "$currentDir\students.json"
$htmlPath = "$currentDir\index.html"

if (-not (Test-Path $xlsxPath)) {
    Write-Host "Error: data.xlsx not found in this folder."
    Write-Host "Please place your student Excel file named 'data.xlsx' in this folder and try again."
    Exit 1
}

# 1. Extract the XLSX file safely using tar.exe (to prevent Antivirus script blocks)
Write-Host "Extracting Excel files..."
if (Test-Path $zipPath) { Remove-Item $zipPath }
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

Copy-Item -Path $xlsxPath -Destination $zipPath
tar.exe -xf $zipPath -C $tempDir
Remove-Item $zipPath # Clean up zip

# 2. Parse XML paths
$sstPath = "$tempDir\xl\sharedStrings.xml"
$wbPath = "$tempDir\xl\workbook.xml"
$relsPath = "$tempDir\xl\_rels\workbook.xml.rels"

if (-not (Test-Path $sstPath) -or -not (Test-Path $wbPath) -or -not (Test-Path $relsPath)) {
    Write-Host "Error: Excel file structure is not supported."
    Remove-Item -Recurse -Force $tempDir
    Exit 1
}

# 3. Read Shared Strings safely bypassing default namespace U+0022xmlnsU+0022 issues
Write-Host "Reading Excel shared strings..."
$sstXml = [xml](Get-Content $sstPath -Encoding utf8)
$sharedStrings = @()
foreach ($si in $sstXml.sst.si) {
    $tNode = $si.ChildNodes | Where-Object { $_.LocalName -eq 't' }
    $rNode = $si.ChildNodes | Where-Object { $_.LocalName -eq 'r' }
    
    if ($tNode) {
        $sharedStrings += $tNode.InnerText
    } elseif ($rNode) {
        $textParts = @()
        foreach ($r in $rNode) {
            $rTNode = $r.ChildNodes | Where-Object { $_.LocalName -eq 't' }
            if ($rTNode) {
                $textParts += $rTNode.InnerText
            }
        }
        $sharedStrings += ($textParts -join "")
    } else {
        $sharedStrings += ""
    }
}

# 4. Read Workbook Relationships
$relsXml = [xml](Get-Content $relsPath -Encoding utf8)
$relMap = @{}
foreach ($rel in $relsXml.Relationships.Relationship) {
    $relMap[$rel.Id] = $rel.Target
}

# 5. Read Workbook Sheets
$wbXml = [xml](Get-Content $wbPath -Encoding utf8)
$sheetFiles = @()
foreach ($s in $wbXml.workbook.sheets.sheet) {
    $rIdAttr = $s.Attributes | Where-Object { $_.LocalName -eq 'id' }
    $rId = $rIdAttr.Value
    $targetFile = $relMap[$rId]
    $sheetFiles += [PSCustomObject]@{
        name = $s.name.Trim()
        file = "$tempDir\xl\$targetFile"
    }
}

# Helper to get cell value safely
function Get-CellValue($c, $sharedStrings) {
    $tAttr = $c.Attributes | Where-Object { $_.LocalName -eq 't' }
    $cType = if ($tAttr) { $tAttr.Value } else { "" }
    
    $vNode = $c.ChildNodes | Where-Object { $_.LocalName -eq 'v' }
    $cVal = if ($vNode) { $vNode.InnerText } else { "" }
    
    if ($cType -eq "s") {
        if ($cVal -match '^\d+$') {
            $idx = [int]$cVal
            if ($idx -lt $sharedStrings.Count) {
                return $sharedStrings[$idx]
            }
        }
        return ""
    }
    return $cVal
}

# Unicode constants to prevent script encoding issues
$charBan = [char]0x73ED # 班
$charShi = [char]0x5E08 # 师
$charSu  = [char]0x5BBF # 宿
$charJi  = [char]0x7EA7 # 级

$students = @()

function Parse-Worksheet($sheetName, $filePath, $sharedStrings) {
    Write-Host "Parsing sheet: $sheetName"
    if (-not (Test-Path $filePath)) { return }
    $wsXml = [xml](Get-Content $filePath -Encoding utf8)
    
    # Find teacher's name and class code in first 10 rows
    $teacher = "Unknown"
    $classCode = $sheetName
    
    foreach ($row in $wsXml.worksheet.sheetData.row) {
        $rowNum = [int]$row.r
        if ($rowNum -le 10) {
            foreach ($c in $row.c) {
                $val = Get-CellValue $c $sharedStrings
                
                # Extract advisor teacher
                if ($val -like "*$charShi*") {
                    if ($val -match '[:\uFF1A]\s*(.*)') {
                        $teacher = $Matches[1].Trim()
                        $teacher = $teacher -replace "$charShi`*$", ""
                        $teacher = $teacher.Trim()
                    }
                }
                
                # Extract English class code
                if ($val -like "*$charBan$charJi*") {
                    if ($val -match '\s+(\S+)$') {
                        $classCode = $Matches[1].Trim()
                    }
                }
            }
        }
    }
    
    # Parse student rows
    foreach ($row in $wsXml.worksheet.sheetData.row) {
        $cellData = @{}
        foreach ($c in $row.c) {
            $col = $c.r -replace '\d+', ''
            $cellData[$col] = Get-CellValue $c $sharedStrings
        }
        
        $seatNo = $cellData['A']
        $studentId = $cellData['B']
        
        if ($seatNo -match '^\d+$' -and $studentId -match '^\d+$') {
            $nameZh = $cellData['C']
            $nameEn = $cellData['D']
            $sex = $cellData['E']
            $hostelField = $cellData['F']
            
            $isHostel = $false
            if ($hostelField -like "*$charSu*") {
                $isHostel = $true
            }
            
            $gender = "M"
            if ($sex -eq "F") { $gender = "F" }
            
            # Photo matching by Student ID prefix in photo directory
            $photo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23d1d5db'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>"
            
            $photoDir = "$currentDir\photo"
            if (Test-Path $photoDir) {
                $matchedFile = Get-ChildItem -Path $photoDir -Recurse -File -Filter "$studentId-*" -ErrorAction SilentlyContinue | Select-Object -First 1
                if (-not $matchedFile) {
                    $matchedFile = Get-ChildItem -Path $photoDir -Recurse -File -Filter "$studentId.*" -ErrorAction SilentlyContinue | Select-Object -First 1
                }
                if ($matchedFile) {
                    $rel = $matchedFile.FullName.Substring($photoDir.Length + 1).Replace("\", "/")
                    $photo = "photo/" + [Uri]::EscapeUriString($rel)
                }
            }
            
            # Map Class code
            $mappedClassCode = $sheetName
            if ($sheetName -eq "初一孝") { $mappedClassCode = "JIX" }
            elseif ($sheetName -eq "初一忠") { $mappedClassCode = "JIZ" }
            elseif ($sheetName -eq "初二孝") { $mappedClassCode = "J2X" }
            elseif ($sheetName -eq "初二忠") { $mappedClassCode = "J2Z" }
            elseif ($sheetName -eq "初三孝") { $mappedClassCode = "J3X" }
            elseif ($sheetName -eq "初三忠") { $mappedClassCode = "J3Z" }
            elseif ($sheetName -eq "高一文商") { $mappedClassCode = "S1AC" }
            elseif ($sheetName -eq "高一餐饮") { $mappedClassCode = "S1CA" }
            elseif ($sheetName -eq "高二文商") { $mappedClassCode = "S2AC" }
            elseif ($sheetName -eq "高二餐饮") { $mappedClassCode = "S2CA" }
            elseif ($sheetName -eq "高三文商") { $mappedClassCode = "S3AC" }
            elseif ($sheetName -eq "高三烘培") { $mappedClassCode = "S3BA" }
            
            $cleanNameZh = ""
            if ($nameZh) { $cleanNameZh = $nameZh.Trim() }
            $cleanNameEn = ""
            if ($nameEn) { $cleanNameEn = $nameEn.Trim() }

            $student = [PSCustomObject]@{
                id = $studentId
                name_zh = $cleanNameZh
                name_en = $cleanNameEn
                class_code = $classCode
                class_zh = $sheetName
                gender = $gender
                is_hostel = $isHostel
                teacher = $teacher
                photo = $photo
            }
            $script:students += $student
        }
    }
}

# Process worksheets
foreach ($sheet in $sheetFiles) {
    Parse-Worksheet $sheet.name $sheet.file $sharedStrings
}

# 6. Inject the student JSON into index.html
$json = $students | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($jsonPath, $json, [System.Text.Encoding]::UTF8)

if (Test-Path $htmlPath) {
    $html = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)
    $pattern = '(?s)const RAW_STUDENTS\s*=\s*\[.*?\]\s*;'
    
    if ($html -match $pattern) {
        $replacement = "const RAW_STUDENTS = $json;"
        $newHtml = $html -replace $pattern, $replacement
        [System.IO.File]::WriteAllText($htmlPath, $newHtml, [System.Text.Encoding]::UTF8)
        Write-Host "Successfully updated index.html with $($students.Count) students."
    } else {
        Write-Host "Error: Could not find RAW_STUDENTS block inside index.html"
    }
} else {
    Write-Host "Error: index.html not found."
}

# 7. Clean up temporary directories
Remove-Item -Recurse -Force $tempDir
Remove-Item $jsonPath
Write-Host "All updates complete!"
