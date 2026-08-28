Attribute VB_Name = "Module_HorariosRRHH"
'==========================================================
' Macro: GenerarHorariosRRHH  (v6)
' Objetivo: Leer la hoja BD_HORARIOS y construir una hoja
' de presentación "Horarios_RRHH" amigable para Recursos
' Humanos (una fila por colaborador, agrupando los días que
' comparten el mismo horario).
'
' v6: los días marcados como "Descanso" ya NO se muestran en
' las columnas "DÍAS" / "HORARIO" — simplemente se omiten, en
' vez de aparecer como una línea "Descanso" en gris. Solo se
' listan los días que el colaborador realmente trabaja.
'
' v5: corrige el error 424 "Se requiere un objeto" que detenía
' la macro después del primer colaborador (se eliminó el uso de
' Array(...) con objetos Range dentro de un For Each). Además,
' "HORAS / SEMANA" ahora se calcula sumando las horas reales de
' cada día trabajado (a partir de los horarios) cuando la
' columna P de BD_HORARIOS viene vacía o en 0.
'
' v4: ya no hay una columna por cada día de la semana. En su
' lugar se agrupan los días consecutivos que comparten el mismo
' horario (ej. "Lunes, Martes" -> "07:00 a 13:00 Y 13:45 a
' 15:45") en dos columnas: "DÍAS" y "HORARIO", cada una con
' varias líneas dentro de la misma celda (una línea por grupo).
'
' v3: se retira la columna de correlativo (N°). Se fusionan
' "CÓDIGO" + "COLABORADOR" en una sola columna "COLABORADOR (ID)"
' para liberar espacio horizontal. Se agrega la columna G de
' BD_HORARIOS como "FECHA INICIO", ubicada justo después de
' "COLABORADOR (ID)".
'
' v2: corrige "No coinciden los tipos" usando conversiones
' seguras (Val, IsDate, IsEmpty) en vez de tipos estrictos
' (Date, CDbl) que fallan con celdas vacías o con la
' configuración regional del sistema (coma vs punto decimal).
'
' Instrucciones de instalación:
' 1. Abrir el archivo .xlsm en Excel.
' 2. ALT + F11 para abrir el editor VBA.
' 3. Si ya existe el módulo "Module_HorariosRRHH", elimínalo
'    (clic derecho > Quitar) antes de importar esta versión.
' 4. Archivo > Importar archivo... y seleccionar este .bas.
' 5. Guardar como .xlsm (Libro de Excel habilitado para macros).
' 6. Ejecutar con ALT + F8 > GenerarHorariosRRHH > Ejecutar.
'==========================================================

' ---- Funciones auxiliares de conversión segura ----

Private Function SafeStr(v As Variant) As String
    If IsError(v) Or IsNull(v) Then
        SafeStr = ""
    Else
        SafeStr = Trim(v & "")
    End If
End Function

Private Function SafeDateVal(v As Variant) As Double
    ' Devuelve el serial de fecha si es válido, o 0 si está vacío:
    On Error Resume Next
    If IsError(v) Then
        SafeDateVal = 0
    ElseIf IsDate(v) Then
        SafeDateVal = CDbl(CDate(v))
    Else
        SafeDateVal = 0
    End If
    On Error GoTo 0
End Function

Private Function SafeHora(v As Variant) As String
    ' Formatea una hora a "hh:mm"; celdas vacías devuelven "".
    ' Acepta tanto valores de tipo Fecha/Hora como números decimales
    ' (fracción de día) que Excel a veces entrega sin marcarlos como Fecha.
    On Error Resume Next
    SafeHora = ""
    If IsError(v) Then Exit Function
    If IsEmpty(v) Then Exit Function
    If VarType(v) = vbString Then
        If Trim(CStr(v)) = "" Then Exit Function
    End If
    If IsDate(v) Then
        SafeHora = Format(v, "hh:mm")
    ElseIf IsNumeric(v) Then
        SafeHora = Format(CDbl(v), "hh:mm")
    End If
    On Error GoTo 0
End Function

Private Function SafeNumero(v As Variant) As Double
    ' Convierte a número sin depender del separador decimal regional.
    Dim t As String
    On Error Resume Next
    If IsError(v) Then
        SafeNumero = 0
        Exit Function
    End If
    t = Trim(SafeStr(v))
    t = Replace(t, ",", ".")
    SafeNumero = Val(t)   ' Val() siempre usa el punto como decimal
    On Error GoTo 0
End Function

Private Function HorasEntreStr(horaIni As String, horaFin As String) As Double
    ' Calcula la cantidad de horas (decimal) entre dos horas "hh:mm".
    ' Si el turno cruza medianoche (fin < inicio), suma 24h al final.
    Dim h1 As Double, h2 As Double
    On Error Resume Next
    HorasEntreStr = 0
    If horaIni = "" Or horaFin = "" Then Exit Function
    If Not IsDate(horaIni) Or Not IsDate(horaFin) Then Exit Function
    h1 = CDbl(TimeValue(horaIni)) * 24
    h2 = CDbl(TimeValue(horaFin)) * 24
    If h2 < h1 Then h2 = h2 + 24
    HorasEntreStr = h2 - h1
    On Error GoTo 0
End Function

Sub GenerarHorariosRRHH()

    Dim wsSrc As Worksheet, wsOut As Worksheet
    Dim ultimaFila As Long, i As Long
    Dim idGrupo As String, idPersonal As String
    Dim fechaReg As Double, code As String, nombre As String
    Dim fechaInicio As String
    Dim dia As String, horasSemana As Variant
    Dim entrada As Variant, iniRef As Variant, finRef As Variant, salida As Variant
    Dim dias As Variant
    Dim colDia As Integer, filaOut As Long
    Dim keyGrupo As Variant
    Dim COL_DIAS As Integer, COL_HORARIO As Integer, COL_HORAS As Integer

    On Error GoTo ManejarError

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Set wsSrc = ThisWorkbook.Sheets("BD_HORARIOS")

    dias = Array("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")

    ' ---- 1) Determinar el grupo de horario VIGENTE por colaborador ----
    ' (el de FECHA_REGISTRO más reciente por ID_PERSONAL)
    Dim dic As Object, dicFecha As Object
    Set dic = CreateObject("Scripting.Dictionary")      ' idPersonal -> idGrupo vigente
    Set dicFecha = CreateObject("Scripting.Dictionary") ' idPersonal -> fecha_registro (serial) vigente

    ultimaFila = wsSrc.Cells(wsSrc.Rows.Count, "A").End(xlUp).Row
    For i = 2 To ultimaFila
        idGrupo = SafeStr(wsSrc.Cells(i, 1).Value)
        If idGrupo <> "" Then
            fechaReg = SafeDateVal(wsSrc.Cells(i, 2).Value)
            idPersonal = SafeStr(wsSrc.Cells(i, 5).Value)
            If idPersonal <> "" Then
                If Not dicFecha.exists(idPersonal) Then
                    dicFecha.Add idPersonal, fechaReg
                    dic.Add idPersonal, idGrupo
                ElseIf fechaReg > dicFecha(idPersonal) Then
                    dicFecha(idPersonal) = fechaReg
                    dic(idPersonal) = idGrupo
                End If
            End If
        End If
    Next i

    ' Set de grupos vigentes
    Dim gruposVigentes As Object
    Set gruposVigentes = CreateObject("Scripting.Dictionary")
    For Each keyGrupo In dic.Keys
        If Not gruposVigentes.exists(dic(keyGrupo)) Then gruposVigentes.Add dic(keyGrupo), True
    Next keyGrupo

    If gruposVigentes.Count = 0 Then
        MsgBox "No se encontraron grupos de horario válidos en BD_HORARIOS.", vbExclamation
        GoTo Salir
    End If

    ' ---- 2) Recolectar horarios por grupo vigente ----
    ' dicHorarios(idGrupo & "|" & dia) = "entrada|iniRef|finRef|salida"  (strings "hh:mm" o "")
    ' dicDatos(idGrupo) = "id|nombre|horasSemana|fechaInicio"
    Dim dicHorarios As Object, dicDatos As Object
    Set dicHorarios = CreateObject("Scripting.Dictionary")
    Set dicDatos = CreateObject("Scripting.Dictionary")

    For i = 2 To ultimaFila
        idGrupo = SafeStr(wsSrc.Cells(i, 1).Value)
        If idGrupo <> "" Then
            If gruposVigentes.exists(idGrupo) Then
                id = SafeStr(wsSrc.Cells(i, 5).Value)
                nombre = SafeStr(wsSrc.Cells(i, 6).Value)
                If IsDate(wsSrc.Cells(i, 7).Value) Then
                    fechaInicio = Format(wsSrc.Cells(i, 7).Value, "dd/mm/yyyy")
                Else
                    fechaInicio = SafeStr(wsSrc.Cells(i, 7).Value)
                End If
                dia = SafeStr(wsSrc.Cells(i, 9).Value)
                entrada = wsSrc.Cells(i, 10).Value
                iniRef = wsSrc.Cells(i, 11).Value
                finRef = wsSrc.Cells(i, 12).Value
                salida = wsSrc.Cells(i, 13).Value
                horasSemana = SafeNumero(wsSrc.Cells(i, 16).Value)

                If InStr(nombre, " (") > 0 Then nombre = Left(nombre, InStr(nombre, " (") - 1)

                If Not dicDatos.exists(idGrupo) Then
                    dicDatos.Add idGrupo, id & "|" & nombre & "|" & horasSemana & "|" & fechaInicio
                End If
                If dia <> "" Then
                    dicHorarios(idGrupo & "|" & dia) = SafeHora(entrada) & "|" & _
                        SafeHora(iniRef) & "|" & SafeHora(finRef) & "|" & SafeHora(salida)
                End If
            End If
        End If
    Next i

    ' ---- 3) Determinar qué días tienen datos (evitar columnas vacías) ----
    Dim diasUsados() As String
    Dim nDias As Integer, d As Integer, usado As Boolean
    nDias = 0
    ReDim diasUsados(6)
    For d = 0 To 6
        usado = False
        For Each keyGrupo In gruposVigentes.Keys
            If dicHorarios.exists(CStr(keyGrupo) & "|" & dias(d)) Then
                usado = True
                Exit For
            End If
        Next keyGrupo
        If usado Then
            diasUsados(nDias) = dias(d)
            nDias = nDias + 1
        End If
    Next d

    If nDias = 0 Then
        MsgBox "No se encontraron días con horario registrado.", vbExclamation
        GoTo Salir
    End If

    ' ---- 4) Crear / limpiar hoja de salida ----
    Application.DisplayAlerts = False
    On Error Resume Next
    ThisWorkbook.Sheets("Horarios_RRHH").Delete
    On Error GoTo ManejarError
    Application.DisplayAlerts = True

    Set wsOut = ThisWorkbook.Sheets.Add(Before:=ThisWorkbook.Sheets(1))
    wsOut.Name = "Horarios_RRHH"

    Dim totalCols As Integer
    totalCols = 5 ' Colaborador (ID), Fecha inicio, Días, Horario, Horas/semana
    COL_DIAS = 3
    COL_HORARIO = 4
    COL_HORAS = totalCols

    With wsOut
        .Range(.Cells(1, 1), .Cells(1, totalCols)).Merge
        .Cells(1, 1).Value = "HORARIOS DE PERSONAL — PRESENTACIÓN PARA RECURSOS HUMANOS"
        .Cells(1, 1).Font.Name = "Arial": .Cells(1, 1).Font.Size = 14
        .Cells(1, 1).Font.Bold = True: .Cells(1, 1).Font.Color = RGB(255, 255, 255)
        .Cells(1, 1).Interior.Color = RGB(31, 78, 120)
        .Cells(1, 1).HorizontalAlignment = xlCenter
        .Rows(1).RowHeight = 26

        .Range(.Cells(2, 1), .Cells(2, totalCols)).Merge
        .Cells(2, 1).Value = "Generado automáticamente desde BD_HORARIOS  ·  Fecha de generación: " & _
            Format(Date, "dd/mm/yyyy") & "  ·  Total de colaboradores: " & gruposVigentes.Count
        .Cells(2, 1).Font.Name = "Arial": .Cells(2, 1).Font.Size = 9
        .Cells(2, 1).Font.Italic = True: .Cells(2, 1).Font.Color = RGB(89, 89, 89)
        .Cells(2, 1).HorizontalAlignment = xlCenter

        Dim headerRow As Integer: headerRow = 4
        .Cells(headerRow, 1).Value = "COLABORADOR (ID)"
        .Cells(headerRow, 2).Value = "FECHA INICIO"
        .Cells(headerRow, COL_DIAS).Value = "DÍAS"
        .Cells(headerRow, COL_HORARIO).Value = "HORARIO"
        .Cells(headerRow, COL_HORAS).Value = "HORAS / SEMANA"

        Dim rngHeader As Range
        Set rngHeader = .Range(.Cells(headerRow, 1), .Cells(headerRow, totalCols))
        With rngHeader
            .Font.Name = "Arial": .Font.Size = 10: .Font.Bold = True
            .Font.Color = RGB(255, 255, 255)
            .Interior.Color = RGB(31, 78, 120)
            .HorizontalAlignment = xlCenter: .VerticalAlignment = xlCenter
            .WrapText = True
            .Borders.Weight = xlThin
            .Borders.Color = RGB(183, 198, 217)
        End With
        .Rows(headerRow).RowHeight = 24

        ' Ordenar grupos vigentes por nombre de colaborador
        Dim listaGrupos() As String
        Dim n As Integer: n = gruposVigentes.Count
        ReDim listaGrupos(n - 1)
        Dim idx As Integer: idx = 0
        For Each keyGrupo In gruposVigentes.Keys
            listaGrupos(idx) = CStr(keyGrupo)
            idx = idx + 1
        Next keyGrupo

        Dim a As Integer, b As Integer, tmp As String
        Dim nombreA As String, nombreB As String
        For a = 0 To n - 2
            For b = 0 To n - 2 - a
                nombreA = SafeStr(Split(dicDatos(listaGrupos(b)), "|")(1))
                nombreB = SafeStr(Split(dicDatos(listaGrupos(b + 1)), "|")(1))
                If nombreA > nombreB Then
                    tmp = listaGrupos(b)
                    listaGrupos(b) = listaGrupos(b + 1)
                    listaGrupos(b + 1) = tmp
                End If
            Next b
        Next a

        filaOut = headerRow + 1
        Dim partes() As String, hor() As String
        Dim texto As String, horasVal As Double, horasCalc As Double
        Dim textosDia() As String
        ReDim textosDia(6)
        Dim lineasDias As String, lineasHorario As String
        Dim inicioGrupo As Integer, finGrupo As Integer, g As Integer
        Dim nombresDias As String, numLineas As Integer

        For i = 0 To n - 1
            idGrupo = listaGrupos(i)
            partes = Split(dicDatos(idGrupo), "|")
            .Cells(filaOut, 1).Value = partes(1) & " (" & partes(0) & ")"
            .Cells(filaOut, 2).Value = partes(3)

            ' Texto de horario por cada día usado + acumulado de horas reales
            horasCalc = 0
            For d = 0 To nDias - 1
                If dicHorarios.exists(idGrupo & "|" & diasUsados(d)) Then
                    hor = Split(dicHorarios(idGrupo & "|" & diasUsados(d)), "|")
                    If hor(0) = "" And hor(3) = "" Then
                        texto = "Descanso"
                    ElseIf hor(1) <> "" And hor(2) <> "" Then
                        texto = hor(0) & " a " & hor(1) & " Y " & hor(2) & " a " & hor(3)
                        horasCalc = horasCalc + HorasEntreStr(hor(0), hor(1)) + HorasEntreStr(hor(2), hor(3))
                    Else
                        texto = hor(0) & " a " & hor(3)
                        horasCalc = horasCalc + HorasEntreStr(hor(0), hor(3))
                    End If
                Else
                    texto = "Descanso"
                End If
                textosDia(d) = texto
            Next d

            ' Agrupar días consecutivos (en el orden semanal ya filtrado)
            ' que comparten exactamente el mismo horario. Los días marcados
            ' como "Descanso" se omiten por completo (no generan línea).
            lineasDias = ""
            lineasHorario = ""
            numLineas = 0
            inicioGrupo = 0
            Do While inicioGrupo < nDias
                finGrupo = inicioGrupo
                Do While finGrupo + 1 < nDias
                    If textosDia(finGrupo + 1) = textosDia(inicioGrupo) Then
                        finGrupo = finGrupo + 1
                    Else
                        Exit Do
                    End If
                Loop

                If textosDia(inicioGrupo) <> "Descanso" Then
                    nombresDias = ""
                    For g = inicioGrupo To finGrupo
                        If nombresDias <> "" Then nombresDias = nombresDias & ", "
                        nombresDias = nombresDias & diasUsados(g)
                    Next g

                    If numLineas > 0 Then
                        lineasDias = lineasDias & Chr(10)
                        lineasHorario = lineasHorario & Chr(10)
                    End If
                    lineasDias = lineasDias & nombresDias
                    lineasHorario = lineasHorario & textosDia(inicioGrupo)
                    numLineas = numLineas + 1
                End If

                inicioGrupo = finGrupo + 1
            Loop

            .Cells(filaOut, COL_DIAS).Value = lineasDias
            .Cells(filaOut, COL_HORARIO).Value = lineasHorario

            ' HORAS / SEMANA: se prioriza el valor calculado a partir de los
            ' horarios reales; si por alguna razón sale en 0 (ej. datos
            ' incompletos), se usa como respaldo el valor de la columna P
            ' de BD_HORARIOS.
            horasVal = horasCalc
            If horasVal <= 0 Then horasVal = SafeNumero(partes(2))
            If horasVal > 0 Then .Cells(filaOut, COL_HORAS).Value = horasVal
            .Cells(filaOut, COL_HORAS).NumberFormat = "0.00"
            .Cells(filaOut, COL_HORAS).Font.Bold = True
            .Cells(filaOut, COL_HORAS).Font.Color = RGB(31, 78, 120)

            Dim rngFila As Range
            Set rngFila = .Range(.Cells(filaOut, 1), .Cells(filaOut, totalCols))
            rngFila.Font.Name = "Arial": rngFila.Font.Size = 10
            rngFila.Borders.Weight = xlThin
            rngFila.Borders.Color = RGB(183, 198, 217)
            .Range(.Cells(filaOut, COL_DIAS), .Cells(filaOut, COL_HORARIO)).HorizontalAlignment = xlLeft
            .Range(.Cells(filaOut, COL_DIAS), .Cells(filaOut, COL_HORARIO)).VerticalAlignment = xlTop
            .Range(.Cells(filaOut, COL_DIAS), .Cells(filaOut, COL_HORARIO)).WrapText = True
            .Cells(filaOut, 1).HorizontalAlignment = xlLeft
            .Cells(filaOut, 1).VerticalAlignment = xlTop
            .Cells(filaOut, 2).HorizontalAlignment = xlCenter
            .Cells(filaOut, 2).VerticalAlignment = xlTop
            .Cells(filaOut, COL_HORAS).HorizontalAlignment = xlCenter
            .Cells(filaOut, COL_HORAS).VerticalAlignment = xlTop

            If (i Mod 2) = 1 Then
                rngFila.Interior.Color = RGB(242, 242, 242)
            End If

            If numLineas > 0 Then
                .Rows(filaOut).RowHeight = 15 * numLineas + 6
            Else
                .Rows(filaOut).RowHeight = 20
            End If

            filaOut = filaOut + 1
        Next i

        .Columns(1).ColumnWidth = 47
        .Columns(2).ColumnWidth = 14
        .Columns(COL_DIAS).ColumnWidth = 46
        .Columns(COL_HORARIO).ColumnWidth = 28
        .Columns(COL_HORAS).ColumnWidth = 14

        .Cells(headerRow + 1, COL_DIAS).Select
        ActiveWindow.FreezePanes = True
        .Activate
        ActiveWindow.DisplayGridlines = False

        With .PageSetup
            .Orientation = xlLandscape
            .FitToPagesWide = 1
            .FitToPagesTall = False
            .PrintTitleRows = "$" & headerRow & ":$" & headerRow
        End With
    End With

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True

    MsgBox "Hoja 'Horarios_RRHH' generada correctamente con " & gruposVigentes.Count & " colaboradores.", vbInformation
    Exit Sub

Salir:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Exit Sub

ManejarError:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    MsgBox "Ocurrió un error al generar la hoja:" & vbCrLf & _
           "Línea/descripción: " & Err.Description & " (Error " & Err.Number & ")" & vbCrLf & _
           "Fila de datos aproximada: " & i, vbCritical, "Error en GenerarHorariosRRHH"

End Sub
