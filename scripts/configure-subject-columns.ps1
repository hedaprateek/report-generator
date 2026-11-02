# First run: node scripts/prepare-template-data.cjs
# Build clean .xlsx files with desktop Excel, hidden, from the prepared data.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$output=Join-Path (Split-Path $root -Parent) '.scratch/report-four-subject-build'
$specs=Get-Content (Join-Path $output 'templates.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.EnableEvents=$false
$excel.AskToUpdateLinks=$false;$excel.AutomationSecurity=3;$excel.ScreenUpdating=$false
$password='TESA-admin'
function Paint-Input($range){$range.Locked=$false;$range.Interior.Color=13431551;$range.Font.Color=4467231}
try {
 foreach($spec in $specs){
  $book=$excel.Workbooks.Add(-4167)
  try {
   for($si=0;$si -lt $spec.sheets.Count;$si++){
    $part=$spec.sheets[$si]
    $sheet=if($si -eq 0){$book.Worksheets.Item(1)}else{$book.Worksheets.Add([Type]::Missing,$book.Worksheets.Item($book.Worksheets.Count))}
    $sheet.Name=$part.name
    $rows=@($part.rows);$width=[int]$part.width;$count=[Math]::Max(1,$rows.Count)
    $matrix=[Array]::CreateInstance([object],[int[]]@($count,$width))
    for($r=0;$r -lt $rows.Count;$r++){
     $values=@($rows[$r])
     for($c=0;$c -lt $values.Count;$c++){
      $value=$values[$c]
      if($null -ne $value -and $value -is [ValueType] -and $value -isnot [bool]){$value=[double]$value}
      $matrix.SetValue($value,$r,$c)
     }
    }
    $sheet.Range($sheet.Cells.Item(1,1),$sheet.Cells.Item($count,$width)).Value2=$matrix
    $sheet.Cells.Font.Name='Calibri';$sheet.Cells.Font.Size=11
    $sheet.Columns.ColumnWidth=16;$sheet.Columns.Item('B:B').ColumnWidth=26
    $sheet.Cells.Locked=$true
    if($part.name -eq 'Instructions'){
     if($spec.segment){
      $sheet.Cells.Clear()
      $lines=@(
       ($spec.segment+' - Excel template'),
       '1. Fill Students, then enter marks in the yellow cells on Marks.',
       '2. Each test or semester starts with FOUR subjects. Rename headings and enter each subject maximum where shown.',
       '3. Need another subject? Copy a subject COLUMN using its letter at the top. Right-click the LAST subject column in the SAME test and choose Insert Copied Cells.',
       '4. Rename the new subject and replace its copied marks. Repeat to add more subjects. No password is needed.',
       '5. Copy subject columns only. Roll No, Student Name, test labels and Total stay protected. Totals update automatically.',
       '6. Use A for absent; leave marks blank if not entered. Save as .xlsx and upload to the app.',
       '7. College: add matching Semester, Subject and Credits rows on Subjects. Copy matching columns on subject-wise Attendance too.',
       'Fixed labels and totals stay protected while adding subject columns.'
      )
      for($r=0;$r -lt $lines.Count;$r++){$sheet.Cells.Item($r+1,1).Value2=$lines[$r]}
     }
     $sheet.Columns.Item('A:B').ColumnWidth=110
     $sheet.UsedRange.WrapText=$true;$sheet.UsedRange.Rows.AutoFit()
     $sheet.UsedRange.Rows.Item(1).Font.Bold=$true
     $sheet.Protect($password);continue
    }
    $header=[int]$part.header;$last=$header+500
    if($part.name -in @('Charges','Payments','Notes','Timetable','Questions')){$last=$header+2000}
    $head=$sheet.Range($sheet.Cells.Item($header,1),$sheet.Cells.Item($header,$width))
    $head.Interior.Color=4467231;$head.Font.Color=16777215;$head.Font.Bold=$true;$head.WrapText=$true;$head.RowHeight=32
    for($c=1;$c -le $width;$c++){
     if([string]$sheet.Cells.Item($header,$c).Value2 -ne ''){Paint-Input $sheet.Range($sheet.Cells.Item($header+1,$c),$sheet.Cells.Item($last,$c))}
    }
    $copySubjects=$spec.segment -and ($part.name -eq 'Marks' -or ($part.name -eq 'Attendance' -and $header -gt 1))
    if($copySubjects){
     $max=0;for($r=1;$r -lt $header;$r++){if([string]$sheet.Cells.Item($r,2).Value2 -match '^MAX MARKS'){$max=$r}}
     if($part.name -eq 'Marks'){Paint-Input $sheet.Range('B1:B3')}
     $start=0;$end=0
     for($c=3;$c -le $width+1;$c++){
      $label=if($c -le $width){[string]$sheet.Cells.Item($header,$c).Value2}else{''}
      if($label -and $label -ne 'Total'){
       if(!$start){$start=$c};$end=$c
       $sheet.Columns.Item($c).Locked=$false
       Paint-Input $sheet.Range($sheet.Cells.Item(1,$c),$sheet.Cells.Item($last,$c))
      }elseif($start){
       if($end-$start+1 -ne 4){throw "Expected four subjects: $($spec.relative) $($part.name)"}
       if($label -eq 'Total'){
        $sheet.Columns.Item($c).Locked=$true
        $formula='=IF(RC2="","",SUMIF(R'+$header+'C'+$start+':R'+$header+'C'+$end+',"<>",RC'+$start+':RC'+$end+'))'
        $sheet.Range($sheet.Cells.Item($header+1,$c),$sheet.Cells.Item($last,$c)).FormulaR1C1=$formula
        if($max){$sheet.Cells.Item($max,$c).FormulaR1C1='=SUMIF(R'+$header+'C'+$start+':R'+$header+'C'+$end+',"<>",R'+$max+'C'+$start+':R'+$max+'C'+$end+')'}
        $sheet.Range($sheet.Cells.Item($header+1,$c),$sheet.Cells.Item($last,$c)).Interior.Color=15132390
       }
       $start=0;$end=0
      }
     }
    }else{
     if($part.name -in @('Attendance','Homework','Milestones')){
      $reserve=if($part.name -eq 'Attendance' -and $header -eq 1){368}elseif($part.name -eq 'Homework'){102}else{$width}
      for($c=3;$c -le $reserve;$c++){
       $sheet.Columns.Item($c).Locked=$false
       Paint-Input $sheet.Range($sheet.Cells.Item($header,$c),$sheet.Cells.Item($last,$c))
      }
     }
     if($part.name -in @('Evaluation','Holistic','Tests')){
      for($r=1;$r -lt $header;$r++){
       for($c=2;$c -le $width;$c++){
        $text=[string]$sheet.Cells.Item($r,$c).Value2
        if($text -and (($c -eq 2 -and [string]$sheet.Cells.Item($r,1).Value2 -in @('ACADEMY','BATCH')) -or $c -gt 2)){Paint-Input $sheet.Cells.Item($r,$c)}
       }
      }
     }
    }
    for($r=1;$r -le $header;$r++){
     if([string]$sheet.Cells.Item($r,2).Value2 -match '^DATE' -or ($part.name -eq 'Attendance' -and $r -eq $header)){
      for($c=3;$c -le $width;$c++){
       $v=$sheet.Cells.Item($r,$c).Value2
       if($v -is [double] -and $v -gt 30000 -and $v -lt 100000){$sheet.Cells.Item($r,$c).NumberFormat='dd-mmm-yyyy'}
      }
     }
    }
    $sheet.Protect($password,$true,$true,$true,$false,$false,$false,$false,[bool]$copySubjects)
    $sheet.EnableSelection=0
   }
   if($spec.segment){[void]$book.Names.Add('_TESA_DefaultSubjects','=4',$false)}
   $book.Protect($password,$true,$false)
   $excel.CalculateFull()
   $target=Join-Path $output ($spec.relative -replace '[\\/]','-')
   $book.SaveAs($target,51)
   Write-Output "Built clean Excel template: $($spec.relative)"
  }finally{$book.Close($false)}
 }
}finally{$excel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)}
foreach($spec in $specs){Copy-Item -LiteralPath (Join-Path $output ($spec.relative -replace '[\\/]','-')) -Destination $spec.source -Force}
