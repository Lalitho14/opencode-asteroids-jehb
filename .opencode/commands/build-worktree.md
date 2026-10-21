---
description: Crea un worktree git en .worktrees/ con nombre derivado del argumento
---

!`$raw = @'
$1
'@
$n = ($raw.Trim().ToLower() -replace '[^a-z0-9]+','-') -replace '^-+','' -replace '-+$',''
if ($n) { git worktree add ".worktrees/$n" } else { Write-Error 'Falta el nombre del worktree' }`

El worktree ya fue creado por el bloque de shell anterior (comando `git worktree add`).
No ejecutes ninguna herramienta, no crees worktrees adicionales y no modifiques archivos.
Responde solo con una linea confirmando la ruta y la rama creadas.
