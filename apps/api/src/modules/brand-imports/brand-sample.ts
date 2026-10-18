import ExcelJS from 'exceljs';

/**
 * Panel → «ورود دیتابیس برند» → «دریافت فایل نمونه»: a one-sheet Excel file whose column titles
 * are recognized automatically (see BRAND_FIELDS aliases), with clearly fake sample rows. Only one
 * sheet, because every sheet of an uploaded workbook is read as data.
 */
export const BRAND_SAMPLE_HEADERS = [
  'شماره فنی', 'نام قطعه', 'نام انگلیسی', 'شماره معادل', 'cross reference', 'شماره جایگزین',
  'گروه قطعه', 'برند خودرو', 'کاربرد در خودرو', 'سال ساخت', 'توضیحات', 'وزن', 'ابعاد',
] as const;

const ROWS: string[][] = [
  ['SMP-04465-001', 'لنت ترمز جلو (نمونه)', 'Front brake pad (SAMPLE)', 'SMP 04465 002', 'ALT-3425', '', 'ترمز', 'ایران خودرو', 'پژو ۴۰۵، سمند', '1390-1400', 'ردیف نمونه؛ پیش از ورود پاک کنید.', '1.2 kg', ''],
  ['SMP-17801-010', 'فیلتر هوا (نمونه)', 'Air filter (SAMPLE)', '', 'ALT-2512', 'SMP-17801-011', 'فیلتر', 'ایران خودرو', 'پژو ۲۰۶', '', 'ردیف نمونه؛ پیش از ورود پاک کنید.', '0.3 kg', ''],
  ['SMP-48510-030', 'کمک فنر جلو (نمونه)', 'Front shock absorber (SAMPLE)', '', '', '', 'جلوبندی و تعلیق', 'سایپا', 'پراید', '1385', 'ردیف نمونه؛ پیش از ورود پاک کنید.', '3.1 kg', '520 mm'],
];

export async function brandSampleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Source by HEDAX';
  const sheet = wb.addWorksheet('قطعات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...BRAND_SAMPLE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  // Part numbers stay text (leading zeros are kept).
  sheet.getColumn(1).numFmt = '@';
  sheet.getColumn(4).numFmt = '@';
  sheet.getColumn(5).numFmt = '@';
  sheet.getColumn(6).numFmt = '@';
  for (const row of ROWS) sheet.addRow(row);
  BRAND_SAMPLE_HEADERS.forEach((_, i) => { sheet.getColumn(i + 1).width = i === 10 ? 34 : 18; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
