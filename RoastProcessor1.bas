Attribute VB_Name = "RoastProcessor"
Option Explicit

Sub ProcessRoastOrder()

    Dim srcWb        As Workbook
    Dim ws           As Worksheet
    Dim s            As Integer
    Dim r            As Long
    Dim lastRow      As Long
    Dim itemName     As String
    Dim qtyVal       As Variant
    Dim qty          As Double
    Dim totalRemoved As Long

    Set srcWb = ActiveWorkbook

    If srcWb.Name = "PERSONAL.XLSB" Then
        MsgBox "Please open the Roast order file first, then run this macro.", vbExclamation, "Wrong file"
        Exit Sub
    End If

    If MsgBox("This will remove all zero-quantity rows from every sheet in this workbook." & vbCrLf & vbCrLf & "Continue?", _
              vbYesNo + vbQuestion, "Roast Order Processor") = vbNo Then Exit Sub

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    totalRemoved = 0

    For s = 1 To srcWb.Sheets.Count

        Set ws = srcWb.Sheets(s)
        lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

        If lastRow < 2 Then GoTo NextSheet

        ' Delete rows where column D is 0 or empty, working bottom up
        For r = lastRow To 2 Step -1
            itemName = Trim(CStr(ws.Cells(r, 1).Value))
            If itemName = "" Then GoTo NextRow

            qtyVal = ws.Cells(r, 4).Value
            qty = 0
            If Not IsEmpty(qtyVal) And qtyVal <> "" Then
                If IsNumeric(qtyVal) Then qty = CDbl(qtyVal)
            End If

            If qty = 0 Then
                ws.Rows(r).Delete
                totalRemoved = totalRemoved + 1
            End If
NextRow:
        Next r

        ' Hide gridlines and autofit column A
        ws.Activate
        ActiveWindow.DisplayGridlines = False
        ws.Columns("A").AutoFit
        If ws.Columns("A").ColumnWidth < 30 Then ws.Columns("A").ColumnWidth = 30

NextSheet:
    Next s

    srcWb.Save

    Application.ScreenUpdating = True
    Application.DisplayAlerts = True

    MsgBox "Done!" & vbCrLf & vbCrLf & _
           srcWb.Sheets.Count & " sheets processed." & vbCrLf & _
           totalRemoved & " zero-quantity rows removed.", _
           vbInformation, "Roast Order Processor"

End Sub
