Option VBASupport 1
Option Explicit

Function NextBlankRow(ws As Worksheet, keyCol As String, firstRow As Long, lastRow As Long) As Long
    Dim r As Long
    For r = firstRow To lastRow
        If Trim(ws.Range(keyCol & r).Text) = "" Then
            NextBlankRow = r
            Exit Function
        End If
    Next r
    MsgBox "Baris sudah penuh (maks " & (lastRow - firstRow + 1) & " baris terisi). Hubungi admin untuk memperluas tabel.", vbExclamation, "Mitra Creative"
    NextBlankRow = -1
End Function

Sub GoToCell(ws As Worksheet, addr As String)
    ws.Activate
    ws.Range(addr).Select
End Sub

' ===================== KAS PERUSAHAAN & KAS PRIBADI =====================
Sub TambahTransUsaha()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Kas Perusahaan")
    Dim r As Long: r = NextBlankRow(ws, "B", 8, 127)
    If r = -1 Then Exit Sub
    ws.Range("A" & r).Value = Date
    ws.Range("E" & r).Value = "Masuk"
    ws.Range("F" & r).Value = "Lunas"
    GoToCell ws, "B" & r
End Sub

Sub TambahTransPribadi()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Kas Pribadi")
    Dim r As Long: r = NextBlankRow(ws, "B", 8, 67)
    If r = -1 Then Exit Sub
    ws.Range("A" & r).Value = Date
    ws.Range("E" & r).Value = "Masuk"
    GoToCell ws, "B" & r
End Sub

' ===================== MARGIN PROYEK =====================
Sub TambahProyek()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Margin Proyek")
    Dim r As Long: r = NextBlankRow(ws, "A", 8, 47)
    If r = -1 Then Exit Sub
    GoToCell ws, "A" & r
End Sub

' ===================== KARYAWAN / ABSENSI / PENGGAJIAN =====================
Sub TambahKaryawan()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Karyawan")
    Dim r As Long: r = NextBlankRow(ws, "A", 8, 37)
    If r = -1 Then Exit Sub
    ws.Range("C" & r).Value = "Harian"
    ws.Range("D" & r).Value = "Aktif"
    GoToCell ws, "A" & r
End Sub

Sub TambahAbsensi()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Absensi Harian")
    Dim r As Long: r = NextBlankRow(ws, "B", 4, 153)
    If r = -1 Then Exit Sub
    ws.Range("A" & r).Value = Date
    ws.Range("C" & r).Value = "Ya"
    ws.Range("D" & r).Value = 0
    GoToCell ws, "B" & r
End Sub

Sub CatatAbsensiHariIni()
    Dim wsK As Worksheet: Set wsK = ThisWorkbook.Sheets("Karyawan")
    Dim wsA As Worksheet: Set wsA = ThisWorkbook.Sheets("Absensi Harian")
    Dim today As Date: today = Date
    Dim rK As Long, rA As Long, added As Long, nama As String, exists As Boolean, newRow As Long
    added = 0
    For rK = 8 To 37
        nama = Trim(wsK.Range("A" & rK).Text)
        If nama <> "" And Trim(wsK.Range("D" & rK).Text) = "Aktif" Then
            exists = False
            For rA = 4 To 153
                If Trim(wsA.Range("B" & rA).Text) = "" Then Exit For
                If Trim(wsA.Range("B" & rA).Text) = nama And wsA.Range("A" & rA).Value = today Then
                    exists = True
                    Exit For
                End If
            Next rA
            If Not exists Then
                newRow = NextBlankRow(wsA, "B", 4, 153)
                If newRow = -1 Then Exit Sub
                wsA.Range("A" & newRow).Value = today
                wsA.Range("B" & newRow).Value = nama
                wsA.Range("C" & newRow).Value = "Ya"
                wsA.Range("D" & newRow).Value = 0
                added = added + 1
            End If
        End If
    Next rK
    MsgBox added & " karyawan aktif dicatat hadir untuk tanggal " & Format(today, "dd/mm/yyyy") & "." & Chr(10) & _
        "Ubah kolom Hadir/Jam Lembur di sheet Absensi Harian bila ada yang tidak hadir atau lembur.", _
        vbInformation, "Absensi Harian"
    wsA.Activate
End Sub

Sub TambahSlipGaji()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Penggajian & Slip Gaji")
    Dim r As Long: r = NextBlankRow(ws, "B", 3, 82)
    If r = -1 Then Exit Sub
    Dim mondayThis As Date: mondayThis = Date - Weekday(Date, vbMonday) + 1
    ws.Range("E" & r).Value = mondayThis
    ws.Range("F" & r).Value = Date
    GoToCell ws, "B" & r
End Sub

Sub CetakSlipGaji()
    Dim wsP As Worksheet: Set wsP = ThisWorkbook.Sheets("Penggajian & Slip Gaji")
    Dim wsC As Worksheet: Set wsC = ThisWorkbook.Sheets("Cetak Slip Gaji")
    If ActiveSheet.Name <> wsP.Name Or ActiveCell.Row < 3 Then
        MsgBox "Klik salah satu baris slip gaji di sheet 'Penggajian & Slip Gaji' dulu, lalu jalankan macro ini lagi.", vbExclamation, "Cetak Slip Gaji"
        Exit Sub
    End If
    Dim noSlip As Variant: noSlip = wsP.Range("A" & ActiveCell.Row).Value
    If Trim(noSlip & "") = "" Then
        MsgBox "Baris ini belum berisi data karyawan.", vbExclamation, "Cetak Slip Gaji"
        Exit Sub
    End If
    wsC.Range("C2").Value = noSlip
    ThisWorkbook.Application.Calculate
    wsC.Activate
    wsC.PrintPreview
End Sub

Sub CetakSlipGajiLangsung()
    ThisWorkbook.Sheets("Cetak Slip Gaji").Activate
    ThisWorkbook.Sheets("Cetak Slip Gaji").PrintPreview
End Sub

' ===================== STOK =====================
Sub TambahBarangStok()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Stok Material & Alat")
    Dim r As Long: r = NextBlankRow(ws, "A", 8, 47)
    If r = -1 Then Exit Sub
    ws.Range("B" & r).Value = "Material"
    GoToCell ws, "A" & r
End Sub

Sub CatatTransaksiStok()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Stok - Riwayat")
    Dim r As Long: r = NextBlankRow(ws, "A", 8, 157)
    If r = -1 Then Exit Sub
    ws.Range("B" & r).Value = Date
    ws.Range("C" & r).Value = "Masuk"
    GoToCell ws, "A" & r
End Sub

' ===================== AHSP =====================
Sub TambahItemAHSP()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("AHSP")
    Dim r As Long: r = NextBlankRow(ws, "B", 4, 43)
    If r = -1 Then Exit Sub
    ws.Range("E" & r).Value = "Manual"
    GoToCell ws, "A" & r
End Sub

Sub TambahKomponenAHSP()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("AHSP - Komponen")
    Dim r As Long: r = NextBlankRow(ws, "A", 8, 87)
    If r = -1 Then Exit Sub
    GoToCell ws, "A" & r
End Sub

' ===================== RAB =====================
Sub TambahRAB()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("RAB")
    Dim r As Long: r = NextBlankRow(ws, "A", 4, 33)
    If r = -1 Then Exit Sub
    ws.Range("E" & r).Value = Date
    ws.Range("G" & r).Value = 0.11
    GoToCell ws, "A" & r
End Sub

Sub TambahItemRAB()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("RAB - Item")
    Dim r As Long: r = NextBlankRow(ws, "B", 8, 157)
    If r = -1 Then Exit Sub
    GoToCell ws, "A" & r
End Sub

' ===================== PENAWARAN HARGA =====================
Sub TambahPenawaran()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Penawaran Harga")
    Dim r As Long: r = NextBlankRow(ws, "A", 4, 33)
    If r = -1 Then Exit Sub
    ws.Range("B" & r).Value = Date
    ws.Range("G" & r).Value = "Draft"
    ws.Range("K" & r).Value = 0.11
    ws.Range("P" & r).Value = "1. Harga sudah termasuk material dan jasa pemasangan sesuai rincian di atas." & Chr(10) & _
        "2. Pembayaran DP 50% saat SPK, pelunasan setelah barang terpasang (BAST)." & Chr(10) & _
        "3. Harga berlaku 14 hari sejak tanggal penawaran ini diterbitkan."
    ws.Range("Q" & r).Value = "Demikian penawaran ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih."
    GoToCell ws, "A" & r
End Sub

Sub TambahItemPenawaran()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Penawaran - Item")
    Dim r As Long: r = NextBlankRow(ws, "B", 8, 157)
    If r = -1 Then Exit Sub
    GoToCell ws, "A" & r
End Sub

Sub CetakPenawaran()
    Dim wsP As Worksheet: Set wsP = ThisWorkbook.Sheets("Penawaran Harga")
    Dim wsC As Worksheet: Set wsC = ThisWorkbook.Sheets("Cetak Penawaran")
    If ActiveSheet.Name <> wsP.Name Or ActiveCell.Row < 4 Then
        MsgBox "Klik salah satu baris penawaran di sheet 'Penawaran Harga' dulu, lalu jalankan macro ini lagi.", vbExclamation, "Cetak Penawaran"
        Exit Sub
    End If
    Dim noSurat As Variant: noSurat = wsP.Range("A" & ActiveCell.Row).Value
    If Trim(noSurat & "") = "" Then
        MsgBox "Baris ini belum berisi No Surat.", vbExclamation, "Cetak Penawaran"
        Exit Sub
    End If
    wsC.Range("C2").Value = noSurat
    ThisWorkbook.Application.Calculate
    wsC.Activate
    wsC.PrintPreview
End Sub

Sub CetakPenawaranLangsung()
    ThisWorkbook.Sheets("Cetak Penawaran").Activate
    ThisWorkbook.Sheets("Cetak Penawaran").PrintPreview
End Sub

' ===================== UMUM =====================
Sub RefreshDashboard()
    ThisWorkbook.Application.Calculate
    MsgBox "Dashboard & semua rumus sudah dihitung ulang.", vbInformation, "Mitra Creative"
End Sub
