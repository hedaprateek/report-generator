# Apply presentation only: keep all values, formulas and protection unchanged.
# Run node scripts/prepare-template-data.cjs first to inventory the 14 templates.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$output=Join-Path (Split-Path $root -Parent) '.scratch/report-template-design'
[void](New-Item -ItemType Directory -Path $output -Force)
$specs=Get-Content (Join-Path (Split-Path $root -Parent) '.scratch/report-four-subject-build/templates.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$password='TESA-admin'
function Colour([string]$hex){return [Convert]::ToInt32($hex.Substring(0,2),16)+256*[Convert]::ToInt32($hex.Substring(2,2),16)+65536*[Convert]::ToInt32($hex.Substring(4,2),16)}
$accents=@('1D4ED8','0F766E','7C3AED','B45309')
$lights=@('EFF6FF','F0FDFA','FAF5FF','FFFBEB')
$totals=@('DBEAFE','CCFBF1','F3E8FF','FEF3C7')
$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.EnableEvents=$false
$excel.AskToUpdateLinks=$false;$excel.AutomationSecurity=3;$excel.ScreenUpdating=$false
try{
 foreach($spec in $specs){
  $book=$excel.Workbooks.Open($spec.source,0,$true)
  try{
   $book.Unprotect($password)
   for($si=0;$si -lt $spec.sheets.Count;$si++){
    $part=$spec.sheets[$si];$sheet=$book.Worksheets.Item($part.name)
    $sheet.Unprotect($password);$sheet.Activate()
    $window=$excel.ActiveWindow;$window.DisplayGridlines=$false;$window.DisplayHeadings=$true;$window.Zoom=85
    $sheet.Tab.Color=Colour $accents[$si%4]
    $sheet.Cells.Font.Name='Calibri';$sheet.Cells.Font.Size=11;$sheet.Cells.Font.Color=Colour '243247'
    if($part.name -eq 'Instructions'){
     $window.DisplayHeadings=$false;$window.Zoom=100
     $sheet.Columns.Item('A:A').ColumnWidth=112
     $sheet.UsedRange.WrapText=$true;$sheet.UsedRange.VerticalAlignment=-4108
     $sheet.UsedRange.Rows.RowHeight=34
     for($r=1;$r -le $sheet.UsedRange.Rows.Count;$r++){
      $cell=$sheet.Cells.Item($r,1);$text=[string]$cell.Value2
      if($text -match 'yellow cells'){$cell.Value2=$text.Replace('yellow cells','coloured entry cells')}
      if($text -and $r -gt 1){$cell.Interior.Color=Colour $(if($r%2){'F8FAFC'}else{'EFF6FF'})}
     }
     $title=$sheet.Range('A1:A1');$title.Font.Size=20;$title.Font.Bold=$true;$title.Font.Color=Colour 'FFFFFF'
     $title.Interior.Color=Colour '1D4ED8';$title.RowHeight=58
     $sheet.UsedRange.Rows.AutoFit();$title.RowHeight=58
     $window.FreezePanes=$false;$window.SplitColumn=0;$window.SplitRow=1;$window.FreezePanes=$true
     $sheet.Protect($password);continue
    }
    $header=[int]$part.header;$width=[int]$part.width;$last=$header+500
    if($part.name -in @('Charges','Payments','Notes','Timetable','Questions')){$last=$header+2000}
    $sheet.Columns.ColumnWidth=16;$sheet.Columns.Item('A:A').ColumnWidth=11;$sheet.Columns.Item('B:B').ColumnWidth=27
    $area=$sheet.Range($sheet.Cells.Item(1,1),$sheet.Cells.Item($last,$width))
    $area.Rows.RowHeight=24;$area.VerticalAlignment=-4108
    $head=$sheet.Range($sheet.Cells.Item($header,1),$sheet.Cells.Item($header,$width))
    $head.Interior.Color=Colour '1F2A44';$head.Font.Color=Colour 'FFFFFF';$head.Font.Bold=$true;$head.WrapText=$true;$head.RowHeight=44
    $head.HorizontalAlignment=-4108
    $sheet.Range($sheet.Cells.Item($header+1,1),$sheet.Cells.Item($last,2)).Interior.Color=Colour 'F8FAFC'
    if($header -gt 1){
     $meta=$sheet.Range($sheet.Cells.Item(1,1),$sheet.Cells.Item($header-1,2))
     $meta.Interior.Color=Colour 'F1F5F9';$meta.Font.Bold=$true;$meta.Font.Size=10
     $sheet.Range('B1:B3').Font.Size=12
    }
    # Empty separator columns delimit the blocks in the existing parser.
    # No merged cells: complete subject columns can still be copied safely.
    $blocks=[Collections.Generic.List[object]]::new();$start=0
    for($c=3;$c -le $width+1;$c++){
     $label=if($c -le $width){[string]$sheet.Cells.Item($header,$c).Value2}else{''}
     if($label){if(!$start){$start=$c}}
     elseif($start){$blocks.Add(@{start=$start;end=$c-1});$start=0}
    }
    $hasBlocks=$header -gt 1 -and $blocks.Count -gt 0
    if($hasBlocks){
     $testRow=0
     for($r=1;$r -lt $header;$r++){if([string]$sheet.Cells.Item($r,2).Value2 -match '^(TEST|SEMESTER|EVAL|CYCLE|TERM)'){$testRow=$r;break}}
     for($bi=0;$bi -lt $blocks.Count;$bi++){
      $block=$blocks[$bi];$colour=Colour $accents[$bi%4];$light=Colour $lights[$bi%4];$total=Colour $totals[$bi%4]
      $cells=$sheet.Range($sheet.Cells.Item($(if($testRow){$testRow}else{1}),$block.start),$sheet.Cells.Item($last,$block.end))
      $cells.Interior.Color=$light
      foreach($edge in @(7,10)){$cells.Borders.Item($edge).LineStyle=1;$cells.Borders.Item($edge).Weight=2;$cells.Borders.Item($edge).Color=$colour}
      $blockHead=$sheet.Range($sheet.Cells.Item($header,$block.start),$sheet.Cells.Item($header,$block.end))
      $blockHead.Interior.Color=$colour;$blockHead.Font.Color=Colour 'FFFFFF';$blockHead.Font.Bold=$true
      if($testRow){
       $band=$sheet.Range($sheet.Cells.Item($testRow,$block.start),$sheet.Cells.Item($testRow,$block.end))
       $band.Interior.Color=$colour;$band.Font.Color=Colour 'FFFFFF';$band.Font.Size=13;$band.Font.Bold=$true;$band.WrapText=$true;$band.RowHeight=34
      }
      for($c=$block.start;$c -le $block.end;$c++){
       if([string]$sheet.Cells.Item($header,$c).Value2 -eq 'Total'){
        $totalCells=$sheet.Range($sheet.Cells.Item($header+1,$c),$sheet.Cells.Item($last,$c))
        $totalCells.Interior.Color=$total;$totalCells.Font.Bold=$true;$totalCells.Font.Color=$colour
        $sheet.Columns.Item($c).ColumnWidth=12
       }
      }
      if($block.end -lt $width){
       $gap=$sheet.Range($sheet.Cells.Item(1,$block.end+1),$sheet.Cells.Item($last,$block.end+1))
       $gap.Interior.Color=Colour 'FFFFFF';$sheet.Columns.Item($block.end+1).ColumnWidth=3
      }
      # One conditional rule per block, so copied columns retain the banding.
      $data=$sheet.Range($sheet.Cells.Item($header+1,$block.start),$sheet.Cells.Item($last,$block.end))
      $data.FormatConditions.Delete()
      $rule=$data.FormatConditions.Add(2,[Type]::Missing,('=AND($B'+($header+1)+'<>"",MOD(ROW(),2)=0)'))
      $rule.Interior.Color=$total
     }
    }else{
     for($c=1;$c -le $width;$c++){
      if($sheet.Cells.Item($header+1,$c).Locked -eq $false){
       $sheet.Range($sheet.Cells.Item($header+1,$c),$sheet.Cells.Item($last,$c)).Interior.Color=Colour 'EFF6FF'
      }
     }
     $data=$sheet.Range($sheet.Cells.Item($header+1,1),$sheet.Cells.Item($last,$width))
     $data.FormatConditions.Delete();$rule=$data.FormatConditions.Add(2,[Type]::Missing,('=AND($B'+($header+1)+'<>"",MOD(ROW(),2)=0)'));$rule.Interior.Color=Colour 'DBEAFE'
    }
    $window.FreezePanes=$false;$window.SplitColumn=2;$window.SplitRow=$header;$window.FreezePanes=$true
    $window.ScrollRow=1;$window.ScrollColumn=1
    $sheet.Cells.Item($header+1,3).Select()
    $copySubjects=$spec.segment -and ($part.name -eq 'Marks' -or ($part.name -eq 'Attendance' -and $header -gt 1))
    $sheet.Protect($password,$true,$true,$true,$false,$false,$false,$false,[bool]$copySubjects)
    $sheet.EnableSelection=0
   }
   if($book.Worksheets.Item('Instructions')){$book.Worksheets.Item('Instructions').Activate();$excel.ActiveWindow.ScrollRow=1;$excel.ActiveWindow.ScrollColumn=1}
   $book.Protect($password,$true,$false)
   $target=Join-Path $output ($spec.relative -replace '[\\/]','-')
   $book.SaveAs($target,51)
   Write-Output "Styled template: $($spec.relative)"
  }finally{$book.Close($false)}
 }
}finally{$excel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)}
foreach($spec in $specs){Copy-Item -LiteralPath (Join-Path $output ($spec.relative -replace '[\\/]','-')) -Destination $spec.source -Force}
