# Integration check against desktop Excel, using disposable workbook copies.
param([switch]$IncludeColourVariants)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$output=Join-Path (Split-Path $root -Parent) '.scratch/report-subject-copy'
[void](New-Item -ItemType Directory -Path $output -Force)
$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.EnableEvents=$false
$excel.AskToUpdateLinks=$false;$excel.AutomationSecurity=3
$results=[Collections.Generic.List[object]]::new()
try {
    $inputs=[Collections.Generic.List[object]]::new()
    foreach($file in Get-ChildItem (Join-Path $root 'assets/templates') -Recurse -Filter '*.xlsx') {
        $relative=$file.FullName.Substring((Join-Path $root 'assets/templates').Length+1)
        if($relative -notmatch '(Primary_Progress|Student_Progress|College_Progress|Master_(Primary|Secondary|Junior_College|College))'){continue}
        $inputs.Add(@{source=$relative;file=$file.FullName;theme=$null})
        if($IncludeColourVariants){foreach($theme in @('ocean','forest','plum')){
            $variant=Join-Path (Split-Path $root -Parent) ('.scratch/report-template-colours/'+$theme+'-'+($relative -replace '[\\/]','-'))
            if(!(Test-Path -LiteralPath $variant)){throw "Missing colour variant: $variant"}
            $inputs.Add(@{source=$relative;file=$variant;theme=$theme})
        }}
    }
    foreach($inputFile in $inputs){
        $relative=$inputFile.source
        $prefix=if($inputFile.theme){$inputFile.theme+'-'}else{''}
        $copy=Join-Path $output ($prefix+($relative -replace '[\\/]','-'))
        Copy-Item -LiteralPath $inputFile.file -Destination $copy -Force
        $book=$excel.Workbooks.Open($copy,0,$false)
        try {
            $sheet=$book.Worksheets.Item('Marks');$values=$sheet.Range('A1:AZ30').Value2
            $hr=0;$max=0
            for($r=1;$r -le 30;$r++) {
                if($values[$r,2] -eq 'Student Name'){$hr=$r;break}
                if([string]$values[$r,2] -match '^MAX MARKS'){$max=$r}
            }
            if(!$hr){throw 'Header missing'}
            if(!$sheet.ProtectContents -or !$sheet.Protection.AllowInsertingColumns){throw 'Column insertion not enabled on a protected sheet'}
            if($sheet.Columns.Item('C:C').Locked -ne $false){throw 'Subject column is not fully unlocked'}
            $hasTotal=$values[$hr,7] -eq 'Total'
            $before=if($hasTotal){[double]$sheet.Cells.Item($hr+1,7).Value2}else{0}
            $beforeMax=if($hasTotal -and $max){[double]$sheet.Cells.Item($max,7).Value2}else{0}
            [void]$sheet.Columns.Item('C:C').Copy()
            [void]$sheet.Columns.Item('F:F').Insert(-4161)
            $sheet.Cells.Item($hr,6).Value2='Computer Science'
            $sheet.Cells.Item($hr+1,6).Value2=42
            if($max){$sheet.Cells.Item($max,6).Value2=50}
            $excel.CalculateFull()
            if($hasTotal -and [double]$sheet.Cells.Item($hr+1,8).Value2 -ne $before+42){throw 'Copied subject missing from total'}
            if($hasTotal -and $max -and [double]$sheet.Cells.Item($max,8).Value2 -ne $beforeMax+50){throw 'Copied subject missing from maximum total'}
            $blocked=$false
            try{$sheet.Cells.Item($hr,2).Value2='Broken header'}catch{$blocked=$true}
            if(!$blocked){throw 'Fixed heading could be overwritten'}
            $book.Save()
            $results.Add(@{source=$relative;theme=$inputFile.theme;copy=$copy;header=$hr;totalBefore=$before})
            Write-Output "Excel copy, insert, edit, totals and locked header verified: $prefix$relative"
        } finally {$book.Close($false)}
    }
    $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'results.json') -Encoding UTF8
} finally {$excel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)}
