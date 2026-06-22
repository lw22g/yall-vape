/**
 * Google Apps Script for Vape & Hookah Accounting System Sync
 * 
 * Instructions:
 * 1. Open Google Sheets.
 * 2. Click on "Extensions" > "Apps Script".
 * 3. Delete any default code and paste this script.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type "Web app".
 * 6. Set Description: "Vape System Sync API".
 * 7. Set Execute as: "Me (your email)".
 * 8. Set Who has access: "Anyone".
 * 9. Click "Deploy", authorize permissions, and copy the "Web app URL".
 * 10. Paste this URL into the settings of the Vape Accounting app.
 */

function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    var type = data.syncType; // 'sales', 'expenses', 'salaries', 'daily_summary', 'treasury'
    var payload = data.payload;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrCreateSheet(ss, type);
    
    var headers = getHeadersForType(type);
    
    // If sheet is empty, write headers
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
    }
    
    // Map payload objects to row values based on type
    var rowsToWrite = [];
    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i++) {
        rowsToWrite.push(objectToRow(type, payload[i], headers));
      }
    } else {
      rowsToWrite.push(objectToRow(type, payload, headers));
    }
    
    // Append rows to sheet
    for (var j = 0; j < rowsToWrite.length; j++) {
      sheet.appendRow(rowsToWrite[j]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data synced successfully to sheet: " + type,
      rowsSynced: rowsToWrite.length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    message: "Google Sheets Sync API is running."
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, type) {
  var sheetName = "";
  switch(type) {
    case "sales": sheetName = "المبيعات (الوارد)"; break;
    case "expenses": sheetName = "المصروفات (الصادر)"; break;
    case "salaries": sheetName = "سحوبات ورواتب الموظفين"; break;
    case "daily_summary": sheetName = "الأرشيف والتقارير اليومية"; break;
    case "treasury": sheetName = "مطابقات الخزينة"; break;
    default: sheetName = "عام";
  }
  
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getHeadersForType(type) {
  switch(type) {
    case "sales":
      return ["التاريخ والوقت", "رقم الفاتورة", "العناصر المباعة", "الإجمالي قبل الخصم", "الخصم", "الصافي المستلم", "المستخدم/الموظف"];
    case "expenses":
      return ["التاريخ والوقت", "رقم العملية", "الفئة", "المبلغ", "التفاصيل", "المستخدم/الموظف"];
    case "salaries":
      return ["التاريخ والوقت", "رقم العملية", "اسم الموظف", "نوع العملية", "المبلغ المسحوب/المدفوع", "التفاصيل", "المستلم بواسطة"];
    case "daily_summary":
      return ["التاريخ", "رقم الأرشيف", "إجمالي الوارد (المبيعات)", "إجمالي الصادر (المصروفات)", "صافي الدخل اليومي", "رصيد الخزينة الفعلي", "الفارق/العجز/الزيادة", "المسؤول عن التصفير"];
    case "treasury":
      return ["التاريخ والوقت", "الرصيد الدفتري (النظام)", "الرصيد الفعلي (المحل)", "الفارق", "الحالة (مطابق/عجز/زيادة)", "الملاحظات وتتبع النقص", "المسؤول"];
    default:
      return ["التاريخ والوقت", "تفاصيل البيانات"];
  }
}

function objectToRow(type, item, headers) {
  var row = [];
  
  if (type === "sales") {
    // Format items as a readable text block
    var itemsStr = "";
    if (Array.isArray(item.items)) {
      itemsStr = item.items.map(function(p) {
        return p.name + " (" + p.quantity + "x @ " + p.price.toLocaleString() + " د.ع)";
      }).join(" | ");
    }
    
    row = [
      item.timestamp || new Date().toISOString(),
      item.invoiceId || "",
      itemsStr,
      item.subtotal || 0,
      item.discount || 0,
      item.total || 0,
      item.createdBy || ""
    ];
  } 
  else if (type === "expenses") {
    row = [
      item.timestamp || new Date().toISOString(),
      item.id || "",
      item.category || "",
      item.amount || 0,
      item.description || "",
      item.createdBy || ""
    ];
  } 
  else if (type === "salaries") {
    row = [
      item.timestamp || new Date().toISOString(),
      item.id || "",
      item.employeeName || "",
      item.transactionType || "سحب من الراتب",
      item.amount || 0,
      item.description || "",
      item.createdBy || ""
    ];
  } 
  else if (type === "daily_summary") {
    row = [
      item.date || new Date().toLocaleDateString("ar-EG"),
      item.archiveId || "",
      item.totalSales || 0,
      item.totalExpenses || 0,
      item.netProfit || 0,
      item.physicalCash || 0,
      item.difference || 0,
      item.closedBy || ""
    ];
  } 
  else if (type === "treasury") {
    row = [
      item.timestamp || new Date().toISOString(),
      item.systemBalance || 0,
      item.physicalBalance || 0,
      item.difference || 0,
      item.status || "",
      item.notes || "",
      item.createdBy || ""
    ];
  } 
  else {
    row = [
      new Date().toISOString(),
      JSON.stringify(item)
    ];
  }
  
  return row;
}
