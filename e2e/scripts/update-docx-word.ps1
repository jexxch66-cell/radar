# Abre un .docx con Microsoft Word (instancia oculta), actualiza la tabla de contenido y los campos,
# guarda el documento y, opcionalmente, exporta un PDF. Requiere Word instalado (Windows).
# Uso: powershell -File e2e/scripts/update-docx-word.ps1 -Docx <ruta.docx> [-Pdf <ruta.pdf>]
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$Pdf
)
$Docx = (Resolve-Path $Docx).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx, $false, $false)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  [void]$doc.Fields.Update()
  $pages = $doc.ComputeStatistics(2)
  $tables = $doc.Tables.Count
  $images = $doc.InlineShapes.Count
  $doc.Save()
  if ($Pdf) { $doc.ExportAsFixedFormat($Pdf, 17) }
  $doc.Close($false)
  "Documento actualizado: $pages paginas, $tables tablas, $images imagenes."
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
